import { describe, expect, it } from "vitest";
import type { AgentDAG, AgentNode, EvaluatorNode, NodeFeedback } from "@personal-agent-os/shared";
import { ExecutionState } from "../../../src/runtime/execution-state.js";
import { __test__, applyEvaluatorRetry, shouldRetry } from "../../../src/runtime/retry-manager.js";

const retryingNode: EvaluatorNode = {
  id: "reviewer",
  version: "1.0.0",
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
    expect(shouldRetry(retryingNode, { data: { shouldRetry: true } })).toBe(true);
    expect(shouldRetry(retryingNode, { data: { shouldRetry: false } })).toBe(false);
  });

  it("returns false for non-evaluator nodes and non-object outputs", () => {
    const toolNode: AgentNode = {
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

    expect(shouldRetry(toolNode, { data: { shouldRetry: true } })).toBe(false);
    expect(shouldRetry(retryingNode, { data: "plain text" })).toBe(false);
  });

  it("collects downstream ids once even when the graph converges", () => {
    const dag: AgentDAG = {
      id: "dag-downstream",
      version: "1.0.0",
      name: "Downstream DAG",
      entryNodeIds: ["draft"],
      exitNodeIds: ["final"],
      nodes: [
        retryingNode,
        { id: "draft", version: "1.0.0", type: "transform", name: "Draft", run: () => ({}), output: { schema: { type: "object", additionalProperties: true } } },
        { id: "summary", version: "1.0.0", type: "transform", name: "Summary", run: () => ({}), output: { schema: { type: "object", additionalProperties: true } } },
        { id: "review", version: "1.0.0", type: "transform", name: "Review", run: () => ({}), output: { schema: { type: "object", additionalProperties: true } } },
        { id: "final", version: "1.0.0", type: "transform", name: "Final", run: () => ({}), output: { schema: { type: "object", additionalProperties: true } } }
      ],
      edges: [
        { id: "a", from: "draft", to: "summary", type: "data" },
        { id: "b", from: "draft", to: "review", type: "data" },
        { id: "c", from: "summary", to: "final", type: "data" },
        { id: "d", from: "review", to: "final", type: "data" }
      ]
    };

    expect(__test__.getDownstreamNodes("draft", dag).sort()).toEqual(["final", "review", "summary"]);
  });

  it("marks the evaluator-provided retry target for retry and clears its downstream outputs", () => {
    const dag: AgentDAG = {
      id: "dag-test",
      version: "1.0.0",
      name: "Retry Test",
      entryNodeIds: ["draft"],
      exitNodeIds: ["reviewer"],
      nodes: [
        {
          id: "draft",
          version: "1.0.0",
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
          version: "1.0.0",
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
        { id: "edge_draft_summary", from: "draft", to: "summary", type: "data" }
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
    state.store("reviewer", { data: { score: 0.4 }, artifacts: [] });

    const targets = applyEvaluatorRetry(
      dag,
      retryingNode,
      {
        data: {
          score: 0.4,
          passed: false,
          issues: ["Please refine"],
          summary: "Please refine",
          shouldRetry: true,
          retryTargetNodeId: "draft"
        }
      },
      feedback,
      state
    );

    expect(targets).toEqual(["draft", "reviewer", "summary"]);
    expect(state.isRetryPending("draft")).toBe(true);
    expect(state.getNodeOutput("draft")).toBeUndefined();
    expect(state.getNodeOutput("summary")).toBeUndefined();
    expect(state.getNodeOutput("reviewer")).toBeUndefined();
    expect(feedback.targetNodeId).toBe("draft");
  });

  it("falls back to retrying the evaluator itself when no retry target is provided", () => {
    const dag: AgentDAG = {
      id: "dag-no-feedback",
      version: "1.0.0",
      name: "No Feedback DAG",
      entryNodeIds: ["reviewer"],
      exitNodeIds: ["reviewer"],
      nodes: [retryingNode],
      edges: []
    };

    const state = new ExecutionState({});
    state.store("reviewer", { data: { score: 0.4 }, artifacts: [] });

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

    expect(
      applyEvaluatorRetry(
        dag,
        retryingNode,
        {
          data: {
            score: 0.4,
            passed: false,
            issues: ["Please refine"],
            summary: "Please refine",
            shouldRetry: true
          }
        },
        feedback,
        state
      )
    ).toEqual(["reviewer"]);
    expect(state.isRetryPending("reviewer")).toBe(true);
    expect(feedback.targetNodeId).toBe("reviewer");
  });

  it("stops scheduling retries after the target reaches the max attempts", () => {
    const state = new ExecutionState({});
    state.markForRetry("draft");

    expect(
      applyEvaluatorRetry(
        {
          id: "dag-max-retries",
          version: "1.0.0",
          name: "Retry Limit DAG",
          entryNodeIds: ["draft"],
          exitNodeIds: ["reviewer"],
          nodes: [
            retryingNode,
            { id: "draft", version: "1.0.0", type: "transform", name: "Draft", run: () => ({}), output: { schema: { type: "object", additionalProperties: true } } }
          ],
          edges: [{ id: "edge_1", from: "draft", to: "reviewer", type: "data" }]
        },
        retryingNode,
        {
          data: {
            score: 0.4,
            passed: false,
            issues: ["Please refine"],
            summary: "Please refine",
            shouldRetry: true,
            retryTargetNodeId: "draft"
          }
        },
        {
          id: "feedback_1",
          nodeExecutionId: "nodeexec_1",
          sourceNodeId: "reviewer",
          targetNodeId: "",
          score: 0.4,
          shouldRetry: true,
          summary: "Please refine",
          createdAt: "2026-04-10T00:00:00.000Z"
        },
        state
      )
    ).toEqual([]);
  });
});
