import { describe, expect, it } from "vitest";
import { dailyBriefing, weeklyGroceryPlanner } from "@personal-agent-os/agent-sdk";
import { executeDAG } from "../../../src/runtime/dag-engine.js";

const context = {
  now: () => "2026-04-10T00:00:00.000Z",
  logger: {
    info: () => undefined
  }
};

describe("executeDAG", () => {
  it("executes a simple DAG through its exit node", async () => {
    const result = await executeDAG(
      dailyBriefing.dag,
      {
        email: "demo@example.com",
        tone: "concise"
      },
      "run_daily",
      context
    );

    expect(result.output).toMatchObject({
      destination: "demo@example.com",
      summary: expect.any(String)
    });
    expect(result.nodeExecutions.length).toBe(3);
    expect(result.nodeFeedback).toEqual([]);
  });

  it("records evaluator feedback for retry-capable DAGs", async () => {
    const result = await executeDAG(
      weeklyGroceryPlanner.dag,
      {
        zipcode: "94107",
        budget: 100,
        email: "demo@example.com",
        householdSize: 2
      },
      "run_weekly",
      context
    );

    expect(result.nodeExecutions.length).toBeGreaterThan(0);
    expect(result.nodeFeedback.length).toBeGreaterThan(0);
    expect(result.nodeFeedback[0]).toMatchObject({
      sourceNodeId: "reviewer"
    });
  });
});
