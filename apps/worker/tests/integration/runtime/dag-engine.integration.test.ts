import { describe, expect, it } from "vitest";
import { weeklyGroceryPlanner } from "@personal-agent-os/agent-sdk";
import { executeDAG } from "../../../src/runtime/dag-engine.js";
import type { ExecutionContext } from "@personal-agent-os/agent-sdk";

const context: ExecutionContext = {
  registry: {
    execute: async (toolName) => {
      if (toolName === "web_search.search") {
        return {
          results: [
            {
              title: "Rice price",
              url: "https://example.com/rice",
              snippet: "$2.99 per bag"
            }
          ]
        };
      }

      return {};
    }
  },
  now: () => "2026-04-10T00:00:00.000Z",
  logger: {
    info: () => undefined
  }
};

describe("executeDAG", () => {
  it("executes the grocery DAG through its final plan node", async () => {
    const result = await executeDAG(
      weeklyGroceryPlanner.dag,
      {
        preferences: {
          days: 7,
          servings: 2,
          budgetUsd: 100,
          dietaryTags: ["balanced"],
          allergies: ["peanuts"],
          pantry: ["rice", "olive oil"]
        }
      },
      "run_weekly",
      context
    );

    expect(result.finalOutput).toMatchObject({
      plan: {
        meals: expect.any(Array),
        groceryList: expect.any(Array),
        totalEstimatedCost: expect.any(Number)
      }
    });
    expect(result.nodeExecutions.length).toBeGreaterThan(0);
    expect(result.nodeExecutions.map((execution) => execution.nodeId)).toEqual([
      "generateMeals",
      "extractIngredients",
      "priceLookup",
      "optimizePlan",
      "validatePlan",
      "finalizePlan"
    ]);
    expect(result.toolInvocations).toHaveLength(1);
    expect(result.toolInvocations[0]).toMatchObject({
      nodeExecutionId: expect.any(String),
      toolName: "web_search.search",
      request: expect.any(Object),
      response: expect.any(Object),
      status: "succeeded",
      createdAt: expect.any(String)
    });
    expect(result.nodeFeedback).toEqual([]);
    expect(result.memoryWrites).toEqual([]);
  });

  it("passes budget feedback through validation output when a plan is over budget", async () => {
    const result = await executeDAG(
      weeklyGroceryPlanner.dag,
      {
        preferences: {
          days: 7,
          servings: 2,
          budgetUsd: 0
        }
      },
      "run_weekly",
      context
    );

    expect(result.nodeExecutions.length).toBeGreaterThan(0);
    expect(result.toolInvocations).toHaveLength(1);
    expect(result.nodeFeedback).toEqual([]);
    expect(result.memoryWrites).toEqual([]);
    const validatePlanExecution = result.nodeExecutions.find((execution) => execution.nodeId === "validatePlan");

    expect(validatePlanExecution?.output?.data).toMatchObject({
      valid: false,
      shouldRetry: true,
      issues: [expect.stringContaining("over budget")],
      feedback: {
        currentCost: expect.any(Number),
        overBudgetBy: expect.any(Number)
      }
    });
  });
});
