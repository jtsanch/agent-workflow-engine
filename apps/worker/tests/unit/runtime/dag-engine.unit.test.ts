import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentDAG, AgentNode, NodeFeedback, NodeExecution } from "@personal-agent-os/shared";
import type { ExecutionContext } from "../../../../../packages/agent-sdk/src/types.js";
import { ExecutionState } from "../../../src/runtime/execution-state.js";

vi.mock("../../../src/runtime/node-runner.js", () => ({
  runNode: vi.fn()
}));

import { DAGExecutionError, __test__ } from "../../../src/runtime/dag-engine.js";
import { runNode } from "../../../src/runtime/node-runner.js";

const runNodeMock = vi.mocked(runNode);

function createContext(): ExecutionContext {
  return {
    registry: {
      execute: vi.fn()
    },
    now: () => "2026-04-10T00:00:00.000Z",
    logger: {
      info: () => undefined
    },
    jobInput: {},
    nodeOutputs: {}
  };
}

describe("dag-engine helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a failed node execution record from an error", () => {
    const node: AgentNode = {
      id: "lookup",
      version: "1.0.0",
      type: "tool",
      name: "Lookup",
      toolName: "web_search.search",
      output: {
        schema: {
          type: "object",
          additionalProperties: true
        }
      }
    };

    const result = __test__.createFailureExecution("run_123", node, { query: "coffee" }, 2, new Error("boom"));

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

  it("schedules retries for feedback targets and records the first target on feedback", () => {
    const dag: AgentDAG = {
      id: "dag_1",
      version: "1.0.0",
      name: "Retry DAG",
      nodes: [
        {
          id: "review",
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
        },
        {
          id: "draft",
          version: "1.0.0",
          type: "transform",
          name: "Draft",
          run: () => ({ text: "draft" }),
          output: {
            schema: {
              type: "object",
              additionalProperties: true
            }
          }
        },
        {
          id: "publish",
          version: "1.0.0",
          type: "transform",
          name: "Publish",
          run: () => ({ ok: true }),
          output: {
            schema: {
              type: "object",
              additionalProperties: true
            }
          }
        }
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

  it("wraps thrown node-runner errors in DAGExecutionError during executeNodesBatch", async () => {
    const node: AgentNode = {
      id: "lookup",
      version: "1.0.0",
      type: "tool",
      name: "Lookup",
      toolName: "web_search.search",
      output: {
        schema: {
          type: "object",
          additionalProperties: true
        }
      }
    };

    runNodeMock.mockRejectedValueOnce(new Error("tool exploded"));

    const nodeExecutions: NodeExecution[] = [];
    const nodeFeedback: NodeFeedback[] = [];

    try {
      await __test__.executeNodesBatch(
        [node],
        "run_123",
        new ExecutionState({}),
        createContext(),
        nodeExecutions,
        nodeFeedback
      );
      throw new Error("Expected executeNodesBatch to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DAGExecutionError);
      expect((error as DAGExecutionError).message).toBe("tool exploded");
      expect((error as DAGExecutionError).nodeExecutions).toHaveLength(1);
      expect((error as DAGExecutionError).nodeFeedback).toEqual([]);
      expect(nodeExecutions[0]).toMatchObject({
        jobRunId: "run_123",
        nodeId: "lookup",
        status: "failed",
        errorMessage: "tool exploded",
        resolvedInput: {}
      });
      expect(nodeExecutions[0]?.output).toEqual({
        data: {
          errorMessage: "tool exploded"
        },
        artifacts: []
      });
    }
  });
});
