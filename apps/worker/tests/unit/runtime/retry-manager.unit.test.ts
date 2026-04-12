import { describe, expect, it } from "vitest";
import type { AgentDAG, AgentNode, NodeFeedback } from "@personal-agent-os/shared";
import { ExecutionState } from "../../../src/runtime/execution-state.js";
import { applyFeedbackRetry, shouldRetry } from "../../../src/runtime/retry-manager.js";

const retryingNode: AgentNode = {
  id: "reviewer",
  type: "evaluator",
  agentKey: "reviewer",
  name: "Reviewer",
  inputMapping: {
    candidate: "draft.text"
  },
  outputSchema: {
    title: "Review Output",
    fields: [{ name: "shouldRetry", type: "boolean", required: true }]
  },
  retryPolicy: {
    maxRetries: 1,
    strategy: "feedback"
  }
};

describe("retry-manager", () => {
  it("retries only when the node allows it and the output requests it", () => {
    const state = new ExecutionState({});

    expect(shouldRetry(retryingNode, { shouldRetry: true }, state)).toBe(true);

    state.markForRetry(retryingNode.id);

    expect(shouldRetry(retryingNode, { shouldRetry: true }, state)).toBe(false);
    expect(shouldRetry(retryingNode, { shouldRetry: false }, state)).toBe(false);
  });

  it("marks feedback targets for retry and clears their downstream outputs", () => {
    const dag: AgentDAG = {
      id: "dag-test",
      version: "1.0.0",
      name: "Retry Test",
      entryNodeIds: ["draft"],
      exitNodeId: "reviewer",
      nodes: [
        {
          id: "draft",
          type: "llm",
          agentKey: "llm.generateText",
          name: "Draft",
          inputMapping: {},
          outputSchema: {
            title: "Draft Output",
            fields: [{ name: "text", type: "string", required: true }]
          },
          retryPolicy: {
            maxRetries: 1,
            strategy: "feedback"
          }
        },
        retryingNode,
        {
          id: "summary",
          type: "aggregator",
          agentKey: "aggregator",
          name: "Summary",
          inputMapping: {
            candidate: "draft.text"
          },
          outputSchema: {
            title: "Summary Output",
            fields: [{ name: "candidate", type: "string", required: true }]
          }
        }
      ],
      edges: [
        { from: "draft", to: "reviewer", type: "data" },
        { from: "draft", to: "summary", type: "data" },
        { from: "reviewer", to: "draft", type: "feedback" }
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
    state.store("draft", { text: "Draft v1" });
    state.store("summary", { candidate: "Draft v1" });

    const targets = applyFeedbackRetry(dag, retryingNode, feedback, state);

    expect(targets).toEqual(["draft"]);
    expect(state.isRetryPending("draft")).toBe(true);
    expect(state.getNodeOutput("draft")).toBeUndefined();
    expect(state.getNodeOutput("summary")).toBeUndefined();
  });
});
