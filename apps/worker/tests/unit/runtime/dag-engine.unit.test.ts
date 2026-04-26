import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentDAG, AgentNode, NodeFeedback, NodeExecution } from "@personal-agent-os/shared";
import type {RunContext} from '@personal-agent-os/agent-sdk';
import { ExecutionState } from "../../../src/runtime/execution-state.js";

vi.mock("../../../src/runtime/node-runner.js", () => ({
  runNode: vi.fn()
}));

import { DAGExecutionError, __test__, executeDAG } from "../../../src/runtime/dag-engine.js";
import { runNode } from "../../../src/runtime/node-runner.js";

const runNodeMock = vi.mocked(runNode);

function createContext(overrides: Partial<RunContext> = {}): RunContext {
  return {
    registry: {
      execute: vi.fn()
    },
    now: () => "2026-04-10T00:00:00.000Z",
    logger: {
      info: () => undefined
    },
    ...overrides
  };
}

function createToolNode(id = "lookup"): AgentNode {
  return {
    id,
    version: "1.0.0",
    type: "tool",
    name: `Tool ${id}`,
    toolName: "web_search.search",
    output: {
      schema: {
        type: "object",
        additionalProperties: true
      }
    }
  };
}

function createTransformNode(id: string): AgentNode {
  return {
    id,
    version: "1.0.0",
    type: "transform",
    name: `Transform ${id}`,
    run: () => ({ ok: true }),
    output: {
      schema: {
        type: "object",
        additionalProperties: true
      }
    }
  };
}

function createEvaluatorNode(id = "review"): AgentNode {
  return {
    id,
    version: "1.0.0",
    type: "evaluator",
    name: "Review",
    promptTemplate: "Evaluate",
    output: {
      schema: {
        type: "object",
        properties: {
          score: { type: "number" },
          passed: { type: "boolean" },
          issues: {
            type: "array",
            items: { type: "string" }
          },
          summary: { type: "string" },
          shouldRetry: { type: "boolean" }
        },
        required: ["score", "passed", "issues", "summary", "shouldRetry"],
        additionalProperties: false
      }
    },
    execution: {
      retryPolicy: {
        maxRetries: 2,
        strategy: "rerun"
      }
    }
  };
}

describe("dag-engine helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes workingState correctly", () => {
    const state = __test__.createInitialWorkingState();

    expect(state.data).toEqual({});
    expect(state.diagnostics.usedFallbacks).toEqual([]);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.data)).toBe(true);
    expect(Object.isFrozen(state.diagnostics)).toBe(true);
  });

  it("creates a failed node execution record from an error", () => {
    const result = __test__.createFailureExecution("run_123", createToolNode(), { query: "coffee" }, 2, new Error("boom"));

    expect(result).toMatchObject({
      jobRunId: "run_123",
      nodeId: "lookup",
      nodeVersion: "1.0.0",
      nodeType: "tool",
      status: "failed",
      resolvedInput: {
        query: "coffee"
      },
      errorMessage: "boom",
      retryCount: 2
    });
    expect(result.output).toEqual({
      data: {
        errorMessage: "boom"
      },
      artifacts: []
    });
  });

  it("falls back to a generic failure message for non-Error values", () => {
    const result = __test__.createFailureExecution("run_123", createToolNode(), {}, 0, "boom");

    expect(result.errorMessage).toBe("Node execution failed");
    expect(result.output).toEqual({
      data: {
        errorMessage: "Node execution failed"
      },
      artifacts: []
    });
  });

  it("returns pending nodes whose incoming data dependencies are completed in sorted order", () => {
    const dag: AgentDAG = {
      id: "dag_runnable",
      version: "1.0.0",
      name: "Runnable DAG",
      nodes: [
        createTransformNode("b_retry"),
        createTransformNode("a_entry"),
        {
          ...createTransformNode("c_child"),
          input: {
            bindings: [{ key: "a", ref: { source: "node_output", nodeId: "a_entry" } }]
          }
        }
      ]
    };

    const state = new ExecutionState({}, dag);
    state.markForRetry("b_retry");

    expect(__test__.getRunnableNodes(dag, state).map((node) => node.id)).toEqual([
      "a_entry",
      "b_retry"
    ]);
  });

  it("excludes nodes that are already completed or running", () => {
    const dag: AgentDAG = {
      id: "dag_status",
      version: "1.0.0",
      name: "Status DAG",
      nodes: [
        createTransformNode("done"),
        createTransformNode("running"),
        createTransformNode("ready")
      ]
    };

    const state = new ExecutionState({}, dag);
    state.store("done", { data: { ok: true }, artifacts: [] });
    state.markRunning("running");

    expect(__test__.getRunnableNodes(dag, state).map((node) => node.id)).toEqual(["ready"]);
  });

  it("stores outputs on state and records feedback", () => {
    const node = createEvaluatorNode();
    const state = new ExecutionState({});
    const context = createContext();
    const nodeExecutions: NodeExecution[] = [];
    const nodeFeedback: NodeFeedback[] = [];
    const feedback: NodeFeedback = {
      id: "feedback_1",
      nodeExecutionId: "nodeexec_1",
      sourceNodeId: "review",
      targetNodeId: "",
      score: 0.9,
      shouldRetry: false,
      summary: "Looks good",
      createdAt: "2026-04-10T00:00:00.000Z"
    };
    state.completeExecution("review", {
      data: {
        score: 0.9,
        passed: true,
        issues: [],
        summary: "Looks good",
        shouldRetry: false
      },
      artifacts: []
    });

    __test__.collectOutputs(
      [
        {
          node,
          input: {},
          result: {
            data: {
              normalized: true
            },
            diagnostics: {
              usedFallbacks: ["fallback_from_node"]
            },
            output: {
              data: {
                score: 0.9,
                passed: true,
                issues: [],
                summary: "Looks good",
                shouldRetry: false
              },
              artifacts: []
            },
            execution: {
              id: "nodeexec_1",
              jobRunId: "run_1",
              nodeId: "review",
              nodeVersion: "1.0.0",
              nodeType: "evaluator",
              status: "succeeded",
              resolvedInput: {},
              output: {
                data: {
                  score: 0.9,
                  passed: true,
                  issues: [],
                  summary: "Looks good",
                  shouldRetry: false
                },
                artifacts: []
              },
              retryCount: 0,
              startedAt: "2026-04-10T00:00:00.000Z",
              completedAt: "2026-04-10T00:00:00.000Z"
            },
            feedback
          }
        }
      ],
      state,
      context,
      nodeExecutions,
      nodeFeedback
    );

    expect(nodeExecutions).toHaveLength(1);
    expect(nodeFeedback).toEqual([feedback]);
    const reviewInstanceId = state.getNodeInstanceId("review");
    expect(state.nodeOutputs[reviewInstanceId]).toHaveLength(1);
    expect(state.nodeOutputs[reviewInstanceId]?.[0]).toMatchObject({
      attempt: 0,
      data: {
        score: 0.9,
        passed: true,
        issues: [],
        summary: "Looks good",
        shouldRetry: false
      },
      artifacts: [],
      success: true
    });
  });

  it("skips retry scheduling when the node is not an evaluator or feedback is missing", () => {
    const dag: AgentDAG = {
      id: "dag_skip",
      version: "1.0.0",
      name: "Skip Retry DAG",
      nodes: [createToolNode("lookup")]
    };

    const state = new ExecutionState({});

    __test__.scheduleRetries(
      dag,
      [
        {
          node: dag.nodes[0],
          input: {},
          result: {
            output: {
              data: { results: [] },
              artifacts: []
            },
            execution: {} as NodeExecution
          }
        }
      ],
      state
    );

    expect(state.getRetryCount("lookup")).toBe(0);
  });

  it("skips retry scheduling when shouldRetry returns false", () => {
    const evaluator = createEvaluatorNode();
    const dag: AgentDAG = {
      id: "dag_no_retry",
      version: "1.0.0",
      name: "No Retry DAG",
      nodes: [evaluator, createTransformNode("draft")]
    };
    const feedback: NodeFeedback = {
      id: "feedback_evt_1",
      nodeExecutionId: "nodeexec_review",
      sourceNodeId: "review",
      targetNodeId: "",
      score: 0.9,
      shouldRetry: false,
      summary: "No retry needed",
      createdAt: "2026-04-10T00:00:00.000Z"
    };
    const state = new ExecutionState({});

    __test__.scheduleRetries(
      dag,
      [
        {
          node: evaluator,
          input: {},
          result: {
            output: {
              data: {
                score: 0.9,
                passed: true,
                issues: [],
                summary: "No retry needed",
                shouldRetry: false
              },
              artifacts: []
            },
            execution: {} as NodeExecution,
            feedback
          }
        }
      ],
      state
    );

    expect(state.getRetryCount("draft")).toBe(0);
    expect(feedback.targetNodeId).toBe("");
  });

  it("schedules retries for the evaluator retry target without clearing state node outputs", () => {
    const dag: AgentDAG = {
      id: "dag_1",
      version: "1.0.0",
      name: "Retry DAG",
      nodes: [
        createTransformNode("draft"),
        {
          ...createEvaluatorNode(),
          input: {
            bindings: [{ key: "draft", ref: { source: "node_output", nodeId: "draft" } }]
          }
        },
        {
          ...createTransformNode("publish"),
          input: {
            bindings: [{ key: "review", ref: { source: "node_output", nodeId: "review" } }]
          }
        }
      ]
    };

    const feedback: NodeFeedback = {
      id: "feedback_evt_1",
      nodeExecutionId: "nodeexec_review",
      sourceNodeId: "review",
      targetNodeId: "",
      score: 0.2,
      shouldRetry: true,
      summary: "Needs another pass",
      createdAt: "2026-04-10T00:00:00.000Z"
    };

    const state = new ExecutionState({}, dag);
    const context = createContext();
    state.store("draft", { data: { text: "old draft" }, artifacts: [] });
    state.store("review", { data: { score: 0.2 }, artifacts: [] });
    state.store("publish", { data: { ok: true }, artifacts: [] });

    __test__.scheduleRetries(
      dag,
      [
        {
          node: dag.nodes[1],
          input: {},
          result: {
            output: {
              data: {
                score: 0.2,
                passed: false,
                issues: ["Needs another pass"],
                summary: "Needs another pass",
                shouldRetry: true,
                retryTargetNodeId: "draft"
              },
              artifacts: []
            },
            execution: {} as NodeExecution,
            feedback
          }
        }
      ],
      state
    );

    expect(state.isRetryPending("draft")).toBe(true);
    expect(state.getRetryCount("draft")).toBe(1);
    expect(state.getNodeOutputs("draft")).toEqual([{ data: { text: "old draft" }, artifacts: [] }]);
    expect(state.getNodeOutputs("review")).toEqual([{ data: { score: 0.2 }, artifacts: [] }]);
    expect(state.getNodeOutputs("publish")).toEqual([{ data: { ok: true }, artifacts: [] }]);
    expect(feedback.targetNodeId).toBe("draft");
    expect(state.nodeOutputs.draft).toEqual([
      expect.objectContaining({
        data: { text: "old draft" },
        success: true
      })
    ]);
    expect(state.nodeOutputs.review).toEqual([
      expect.objectContaining({
        data: { score: 0.2 },
        success: true
      })
    ]);
    expect(state.nodeOutputs.publish).toEqual([
      expect.objectContaining({
        data: { ok: true },
        success: true
      })
    ]);
  });

  it("throws when runnable nodes declare conflicting writes", () => {
    expect(() =>
      __test__.assertNoWriteConflicts([
        {
          ...createTransformNode("draft_a"),
          writes: ["workingState.data.plan"]
        },
        {
          ...createTransformNode("draft_b"),
          writes: ["workingState.data.plan"]
        }
      ])
    ).toThrow('Write conflict on field "workingState.data.plan" between nodes: draft_a, draft_b');
  });

  it("stops batch execution before runNode when conflicting writes are detected", async () => {
    await expect(
      __test__.executeNodesBatch(
        [
          {
            ...createTransformNode("draft_a"),
            writes: ["workingState.data.plan"]
          },
          {
            ...createTransformNode("draft_b"),
            writes: ["workingState.data.plan"]
          }
        ],
        "run_conflict",
        new ExecutionState({}),
        createContext(),
        [],
        []
      )
    ).rejects.toThrow('Write conflict on field "workingState.data.plan" between nodes: draft_a, draft_b');

    expect(runNodeMock).not.toHaveBeenCalled();
  });

  it("falls back to the evaluator as the retry target when none is provided", () => {
    const evaluator = createEvaluatorNode();
    const dag: AgentDAG = {
      id: "dag_empty_targets",
      version: "1.0.0",
      name: "Empty Targets DAG",
      nodes: [evaluator]
    };
    const feedback: NodeFeedback = {
      id: "feedback_evt_1",
      nodeExecutionId: "nodeexec_review",
      sourceNodeId: "review",
      targetNodeId: "",
      score: 0.1,
      shouldRetry: true,
      summary: "Retry requested",
      createdAt: "2026-04-10T00:00:00.000Z"
    };

    __test__.scheduleRetries(
      dag,
      [
        {
          node: evaluator,
          input: {},
          result: {
            output: {
              data: {
                score: 0.1,
                passed: false,
                issues: ["Retry requested"],
                summary: "Retry requested",
                shouldRetry: true
              },
              artifacts: []
            },
            execution: {} as NodeExecution,
            feedback
          }
        }
      ],
      new ExecutionState({})
    );

    expect(feedback.targetNodeId).toBe("review");
  });

  it("wraps thrown node-runner errors in DAGExecutionError during executeNodesBatch", async () => {
    const node = createToolNode();

    runNodeMock.mockRejectedValueOnce(new Error("tool exploded"));

    const nodeExecutions: NodeExecution[] = [];
    const nodeFeedback: NodeFeedback[] = [];

    await expect(
      __test__.executeNodesBatch(
        [node],
        "run_123",
        new ExecutionState({}),
        createContext(),
        nodeExecutions,
        nodeFeedback
      )
    ).rejects.toThrow("tool exploded");

    expect(nodeExecutions[0]).toMatchObject({
      jobRunId: "run_123",
      nodeId: "lookup",
      status: "failed",
      errorMessage: "tool exploded",
      resolvedInput: {}
    });
  });

  it("uses a generic DAGExecutionError message for non-Error throws", async () => {
    runNodeMock.mockRejectedValueOnce("boom");

    await expect(
      __test__.executeNodesBatch(
        [createToolNode()],
        "run_123",
        new ExecutionState({}),
        createContext(),
        [],
        []
      )
    ).rejects.toMatchObject({
      message: "DAG execution failed"
    });
  });

  it("collects tool invocations for failed, pending, primitive, and fallback cases", () => {
    const dag: AgentDAG = {
      id: "dag_tools",
      version: "1.0.0",
      name: "Tools DAG",
      nodes: [createToolNode("lookup")]
    };
    const nodeExecutions: NodeExecution[] = [
      {
        id: "nodeexec_failed",
        jobRunId: "run_1",
        nodeId: "lookup",
        nodeVersion: "1.0.0",
        nodeType: "tool",
        status: "failed",
        input: { query: "coffee" },
        resolvedInput: { ignored: true },
        output: undefined,
        retryCount: 0,
        startedAt: "2026-04-10T00:00:00.000Z",
        completedAt: "2026-04-10T00:00:01.000Z"
      },
      {
        id: "nodeexec_pending",
        jobRunId: "run_1",
        nodeId: "lookup",
        nodeVersion: "1.0.0",
        nodeType: "tool",
        status: "pending",
        resolvedInput: { query: "tea" },
        output: {
          data: "queued",
          artifacts: []
        },
        retryCount: 0,
        startedAt: "2026-04-10T00:00:02.000Z"
      },
      {
        id: "nodeexec_running",
        jobRunId: "run_1",
        nodeId: "lookup",
        nodeVersion: "1.0.0",
        nodeType: "tool",
        status: "running",
        resolvedInput: { query: "juice" },
        output: {
          data: { ok: true },
          artifacts: []
        },
        retryCount: 0,
        startedAt: "2026-04-10T00:00:03.000Z",
        completedAt: "2026-04-10T00:00:04.000Z"
      },
      {
        id: "nodeexec_missing_tool",
        jobRunId: "run_1",
        nodeId: "missing",
        nodeVersion: "1.0.0",
        nodeType: "tool",
        status: "succeeded",
        resolvedInput: {},
        output: {
          data: { ok: true },
          artifacts: []
        },
        retryCount: 0,
        startedAt: "2026-04-10T00:00:05.000Z",
        completedAt: "2026-04-10T00:00:06.000Z"
      },
      {
        id: "nodeexec_non_tool",
        jobRunId: "run_1",
        nodeId: "transform_1",
        nodeVersion: "1.0.0",
        nodeType: "transform",
        status: "succeeded",
        resolvedInput: {},
        output: {
          data: { ok: true },
          artifacts: []
        },
        retryCount: 0,
        startedAt: "2026-04-10T00:00:07.000Z",
        completedAt: "2026-04-10T00:00:08.000Z"
      }
    ];

    const invocations = __test__.collectToolInvocations(dag, nodeExecutions);

    expect(invocations).toEqual([
      {
        id: expect.any(String),
        nodeExecutionId: "nodeexec_failed",
        toolName: "web_search.search",
        request: { query: "coffee" },
        response: undefined,
        status: "failed",
        createdAt: "2026-04-10T00:00:01.000Z"
      },
      {
        id: expect.any(String),
        nodeExecutionId: "nodeexec_pending",
        toolName: "web_search.search",
        request: { query: "tea" },
        response: { value: "queued" },
        status: "pending",
        createdAt: "2026-04-10T00:00:02.000Z"
      },
      {
        id: expect.any(String),
        nodeExecutionId: "nodeexec_running",
        toolName: "web_search.search",
        request: { query: "juice" },
        response: { ok: true },
        status: "pending",
        createdAt: "2026-04-10T00:00:04.000Z"
      }
    ]);
  });

  it("returns single and multi-exit final outputs", () => {
    const state = new ExecutionState({});
    state.store("a", { data: { value: 1 }, artifacts: [] });
    state.store("b", { data: { value: 2 }, artifacts: [] });

    expect(
      __test__.collectFinalOutputs(
        {
          id: "dag_single",
          version: "1.0.0",
          name: "Single Exit",
          nodes: [createTransformNode("a")]
        },
        state
      )
    ).toEqual({ value: 1 });

    expect(
      __test__.collectFinalOutputs(
        {
          id: "dag_multi",
          version: "1.0.0",
          name: "Multi Exit",
          nodes: [createTransformNode("a"), createTransformNode("b")]
        },
        state
      )
    ).toEqual({
      a: { value: 1 },
      b: { value: 2 }
    });
  });
});

describe("executeDAG", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes pending nodes with no incoming data edges", async () => {
    const dag: AgentDAG = {
      id: "dag_blocked",
      version: "1.0.0",
      name: "Blocked DAG",
      nodes: [createTransformNode("blocked")]
    };
    runNodeMock.mockResolvedValueOnce({
      output: {
        data: { ok: true },
        artifacts: []
      },
      execution: {
        id: "nodeexec_blocked",
        jobRunId: "run_1",
        nodeId: "blocked",
        nodeVersion: "1.0.0",
        nodeType: "transform",
        status: "succeeded",
        resolvedInput: {},
        output: {
          data: { ok: true },
          artifacts: []
        },
        retryCount: 0,
        startedAt: "2026-04-10T00:00:00.000Z",
        completedAt: "2026-04-10T00:00:01.000Z"
      }
    });

    const result = await executeDAG(dag, {}, "run_1", createContext());

    expect(result).toEqual({
      finalOutput: { ok: true },
      nodeExecutions: [
        expect.objectContaining({
          id: "nodeexec_blocked",
          nodeId: "blocked"
        })
      ],
      toolInvocations: [],
      nodeFeedback: [],
      memoryWrites: []
    });
  });

  it("wraps execution failures with accumulated execution state", async () => {
    const dag: AgentDAG = {
      id: "dag_error",
      version: "1.0.0",
      name: "Error DAG",
      nodes: [createToolNode("lookup")]
    };

    runNodeMock.mockRejectedValueOnce(new Error("node failed"));

    await expect(executeDAG(dag, {}, "run_1", createContext())).rejects.toBeInstanceOf(DAGExecutionError);
  });
});
