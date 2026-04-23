import { describe, expect, it } from "vitest";
import type { AgentDAG, EvaluatorNode, NodeFeedback } from "@personal-agent-os/shared";
import { ExecutionState } from "../../../src/runtime/execution-state.js";
import { applyFeedbackRetry, shouldRetry } from "../../../src/runtime/retry-manager.js";

const retryingNode: EvaluatorNode = {
  id: "reviewer",
  version: 1,
  type: "evaluator",
  name: "Reviewer",
  promptTemplate: "Return evaluation JSON",
  input: {
    schema: {
      type: "object",
      properties: {
        draftSummary: { type: "string" }
      },
      required: ["draftSummary"],
      additionalProperties: false
    }
  },
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
    },
    outputKind: "critique"
  },
  execution: {
    retryPolicy: {
      maxRetries: 1,
      strategy: "rerun"
    }
  }
};

describe("retry-manager", () => {
  it("retries only when the node allows it and the output requests it", () => {
    const state = new ExecutionState({});

    expect(shouldRetry(retryingNode, { data: { shouldRetry: true } }, state)).toBe(true);

    state.markForRetry(retryingNode.id);

    expect(shouldRetry(retryingNode, { data: { shouldRetry: true } }, state)).toBe(false);
    expect(shouldRetry(retryingNode, { data: { shouldRetry: false } }, state)).toBe(false);
  });

  it("marks feedback targets for retry and clears their downstream outputs", () => {
    const dag: AgentDAG = {
      id: "dag-test",
      version: "1.0.0",
      name: "Retry Test",
      entryNodeIds: ["draft"],
      exitNodeIds: ["reviewer"],
      nodes: [
        {
          id: "draft",
          version: 1,
          type: "llm",
          name: "Draft",
          promptTemplate: "Return JSON",
          input: {
            schema: {
              type: "object",
              properties: {},
              additionalProperties: false
            }
          },
          output: {
            schema: {
              type: "object",
              properties: {
                planSummary: { type: "string" }
              },
              required: ["planSummary"],
              additionalProperties: false
            }
          },
          outputConfig: {
            schema: {
              type: "object",
              properties: {
                planSummary: { type: "string" }
              }
            },
            enforcement: "strict"
          }
        },
        retryingNode,
        {
          id: "summary",
          version: 1,
          type: "transform",
          name: "Summary",
          input: {
            schema: {
              type: "object",
              properties: {
                planSummary: { type: "string" }
              },
              required: ["planSummary"],
              additionalProperties: false
            }
          },
          run: async (input) => ({ draftSummary: input.planSummary }),
          output: {
            schema: {
              type: "object",
              properties: {
                draftSummary: { type: "string" }
              },
              required: ["draftSummary"],
              additionalProperties: false
            }
          }
        }
      ],
      edges: [
        { id: "edge_draft_review", from: "draft", to: "reviewer", type: "data" },
        { id: "edge_draft_summary", from: "draft", to: "summary", type: "data" },
        { id: "edge_review_draft", from: "reviewer", to: "draft", type: "feedback" }
      ]
    };
    const feedback: NodeFeedback = {
      id: "feedback_1",
      nodeExecutionId: "nodeexec_1",
      sourceNodeId: "reviewer",
      targetNodeId: "",
      score: 0.4,
      shouldRetry: true,
      summary: "Please refine",
      createdAt: "2026-04-10T00:00:00.000Z"
    };
    const state = new ExecutionState({});
    state.store("draft", { data: { planSummary: "Draft v1" }, artifacts: [] });
    state.store("summary", { data: { draftSummary: "Draft v1" }, artifacts: [] });

    const targets = applyFeedbackRetry(dag, retryingNode, feedback, state);

    expect(targets).toEqual(["draft"]);
    expect(state.isRetryPending("draft")).toBe(true);
    expect(state.getNodeOutput("draft")).toBeUndefined();
    expect(state.getNodeOutput("summary")).toBeUndefined();
  });
});
