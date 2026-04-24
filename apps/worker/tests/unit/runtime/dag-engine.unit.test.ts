import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentDAG, AgentNode, NodeFeedback, NodeExecution } from "@personal-agent-os/shared";
import type { ExecutionContext } from "@personal-agent-os/agent-sdk";
import { ExecutionState } from "../../../src/runtime/execution-state.js";

vi.mock("../../../src/runtime/node-runner.js", () => ({
  runNode: vi.fn()
}));

import { DAGExecutionError, __test__, executeDAG } from "../../../src/runtime/dag-engine.js";
import { runNode } from "../../../src/runtime/node-runner.js";

const runNodeMock = vi.mocked(runNode);

function createContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    registry: {
      execute: vi.fn()
    },
    now: () => "2026-04-10T00:00:00.000Z",
    logger: {
      info: () => undefined
    },
    jobInput: {},
    nodeOutputs: {},
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

  it("returns runnable entry nodes, nullish data edges, and retry-pending nodes in sorted order", () => {
    const dag: AgentDAG = {
      id: "dag_runnable",
      version: "1.0.0",
      name: "Runnable DAG",
      nodes: [
        createTransformNode("b_retry"),
        createTransformNode("a_entry"),
        createTransformNode("c_child")
      ],
      edges: [
        { id: "edge_1", from: "a_entry", to: "c_child" }
      ],
      entryNodeIds: ["a_entry"],
      exitNodeIds: ["c_child"]
    };

    const state = new ExecutionState({});
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
      ],
      edges: [],
      entryNodeIds: ["done", "running", "ready"],
      exitNodeIds: ["ready"]
    };

    const state = new ExecutionState({});
    state.store("done", { data: { ok: true }, artifacts: [] });
    state.markRunning("running");

    expect(__test__.getRunnableNodes(dag, state).map((node) => node.id)).toEqual(["ready"]);
  });

  it("stores outputs, initializes nodeOutputs when missing, and records feedback", () => {
    const node = createEvaluatorNode();
    const state = new ExecutionState({});
    const context = createContext({ nodeOutputs: undefined });
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

    __test__.collectOutputs(
      [
        {
          node,
          input: {},
          result: {
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
    expect(context.nodeOutputs?.review).toEqual({
      data: {
        score: 0.9,
        passed: true,
        issues: [],
        summary: "Looks good",
        shouldRetry: false
      },
      artifacts: []
    });
  });

  it("skips retry scheduling when the node is not an evaluator or feedback is missing", () => {
    const dag: AgentDAG = {
      id: "dag_skip",
      version: "1.0.0",
      name: "Skip Retry DAG",
      nodes: [createToolNode("lookup")],
      edges: [],
      entryNodeIds: ["lookup"],
      exitNodeIds: ["lookup"]
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
      nodes: [evaluator, createTransformNode("draft")],
      edges: [{ id: "feedback_1", from: "review", to: "draft", type: "feedback" }],
      entryNodeIds: ["draft"],
      exitNodeIds: ["draft"]
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

  it("schedules retries for feedback targets and records the first target on feedback", () => {
    const dag: AgentDAG = {
      id: "dag_1",
      version: "1.0.0",
      name: "Retry DAG",
      nodes: [
        createEvaluatorNode(),
        createTransformNode("draft"),
        createTransformNode("publish")
      ],
      edges: [
        { id: "feedback_1", from: "review", to: "draft", type: "feedback" },
        { id: "data_1", from: "draft", to: "publish", type: "data" }
      ],
      entryNodeIds: ["draft"],
      exitNodeIds: ["publish"]
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

    const state = new ExecutionState({});
    state.store("draft", { data: { text: "old draft" }, artifacts: [] });
    state.store("publish", { data: { ok: true }, artifacts: [] });

    __test__.scheduleRetries(
      dag,
      [
        {
          node: dag.nodes[0],
          input: {},
          result: {
            output: {
              data: {
                score: 0.2,
                passed: false,
                issues: ["Needs another pass"],
                summary: "Needs another pass",
                shouldRetry: true
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
    expect(state.getNodeOutput("draft")).toBeUndefined();
    expect(state.getNodeOutput("publish")).toBeUndefined();
    expect(feedback.targetNodeId).toBe("draft");
  });

  it("leaves targetNodeId unchanged when retrying without feedback edges", () => {
    const evaluator = createEvaluatorNode();
    const dag: AgentDAG = {
      id: "dag_empty_targets",
      version: "1.0.0",
      name: "Empty Targets DAG",
      nodes: [evaluator],
      edges: [],
      entryNodeIds: ["review"],
      exitNodeIds: ["review"]
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

    expect(feedback.targetNodeId).toBe("");
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
      nodes: [createToolNode("lookup")],
      edges: [],
      entryNodeIds: ["lookup"],
      exitNodeIds: ["lookup"]
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
          nodes: [createTransformNode("a")],
          edges: [],
          entryNodeIds: ["a"],
          exitNodeIds: ["a"]
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
          nodes: [createTransformNode("a"), createTransformNode("b")],
          edges: [],
          entryNodeIds: ["a", "b"],
          exitNodeIds: ["a", "b"]
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

  it("breaks cleanly when the DAG has no runnable nodes", async () => {
    const dag: AgentDAG = {
      id: "dag_blocked",
      version: "1.0.0",
      name: "Blocked DAG",
      nodes: [createTransformNode("blocked")],
      edges: [],
      entryNodeIds: [],
      exitNodeIds: ["blocked"]
    };

    const result = await executeDAG(dag, {}, "run_1", createContext());

    expect(result).toEqual({
      finalOutput: undefined,
      nodeExecutions: [],
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
      nodes: [createToolNode("lookup")],
      edges: [],
      entryNodeIds: ["lookup"],
      exitNodeIds: ["lookup"]
    };

    runNodeMock.mockRejectedValueOnce(new Error("node failed"));

    await expect(executeDAG(dag, {}, "run_1", createContext())).rejects.toBeInstanceOf(DAGExecutionError);
  });
});
