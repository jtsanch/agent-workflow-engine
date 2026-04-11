import { describe, expect, it } from "vitest";
import type { AgentNode } from "@personal-agent-os/shared";
import { runNode } from "./node-runner.js";

const context = {
  now: () => "2026-04-10T00:00:00.000Z",
  logger: {
    info: () => undefined
  }
};

describe("runNode", () => {
  it("executes a tool node", async () => {
    const node: AgentNode = {
      id: "deals",
      type: "tool",
      agentKey: "web_search.search",
      name: "Deals",
      inputMapping: {
        query: "$job.zipcode"
      },
      outputSchema: {
        title: "Deals",
        fields: [{ name: "results", type: "array", required: true }]
      }
    };

    const result = await runNode("run_1", node, { query: "94107" }, 0, context);

    expect(result.output).toMatchObject({
      query: "94107"
    });
    expect(result.execution.status).toBe("succeeded");
  });

  it("executes an llm node", async () => {
    const node: AgentNode = {
      id: "draft",
      type: "llm",
      agentKey: "llm.generateText",
      name: "Draft",
      inputMapping: {
        prompt: "source.text"
      },
      outputSchema: {
        title: "Draft",
        fields: [{ name: "text", type: "string", required: true }]
      }
    };

    const result = await runNode("run_1", node, { prompt: "Write summary" }, 0, context);

    expect(result.output).toMatchObject({
      text: expect.any(String),
      tokensUsed: 180
    });
    expect(result.execution.tokenUsage).toBe(180);
  });

  it("executes an aggregator node", async () => {
    const node: AgentNode = {
      id: "aggregate",
      type: "aggregator",
      agentKey: "aggregator",
      name: "Aggregate",
      inputMapping: {},
      outputSchema: {
        title: "Aggregate",
        fields: [{ name: "summary", type: "string" }]
      }
    };

    const result = await runNode("run_1", node, { summary: "hello" }, 0, context);

    expect(result.output).toEqual({
      summary: "hello",
      aggregatedAt: "2026-04-10T00:00:00.000Z"
    });
  });

  it("executes an evaluator node and emits retry feedback when needed", async () => {
    const node: AgentNode = {
      id: "review",
      type: "evaluator",
      agentKey: "reviewer",
      name: "Review",
      inputMapping: {
        candidate: "draft.text"
      },
      outputSchema: {
        title: "Review",
        fields: [{ name: "score", type: "number", required: true }]
      }
    };

    const result = await runNode("run_1", node, { candidate: "short" }, 0, context);

    expect(result.output).toMatchObject({
      shouldRetry: true
    });
    expect(result.feedback).toMatchObject({
      sourceNodeId: "review",
      shouldRetry: true
    });
    expect(result.execution.status).toBe("retry_scheduled");
  });
});
