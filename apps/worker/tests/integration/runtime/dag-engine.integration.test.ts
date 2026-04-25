import { describe, expect, it } from "vitest";
import { weeklyGroceryPlanner } from "../../../src/agents/index.js";
import { executeDAG } from "../../../src/runtime/dag-engine.js";
import type { ExecutionContext } from "../../../../../packages/agent-sdk/src/types.js";

const context: ExecutionContext = {
  registry: {
    execute: async () => ({})
  },
  workingState: {
    data: {},
    diagnostics: {
      usedFallbacks: [],
      warnings: [],
      constraintResults: {},
      signals: {}
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
      meals: expect.any(Array),
      groceryList: expect.any(Array),
      totalCost: expect.any(Number)
    });
    expect((result.finalOutput as { meals: unknown[] }).meals).toHaveLength(4);
    expect(result.nodeExecutions.length).toBeGreaterThan(0);
    expect(result.nodeExecutions.map((execution) => execution.nodeId)).toEqual([
      "generateMeals",
      "estimateNutrition",
      "normalizeMeals",
      "aggregateIngredients",
      "convertToPurchasableUnits",
      "calculateCosts",
      "validatePlan",
      "finalizePlan"
    ]);
    expect(result.toolInvocations).toEqual([]);
    expect(result.nodeFeedback).toHaveLength(1);
    expect(result.nodeFeedback[0]).toMatchObject({
      sourceNodeId: "validatePlan",
      shouldRetry: false
    });
    expect(result.memoryWrites).toEqual([]);
  });

  it("produces meals with nutrition and grocery item costs in the final JSON output", async () => {
    const result = await executeDAG(
      weeklyGroceryPlanner.dag,
      {
        preferences: {
          days: 1,
          servings: 2,
          budgetUsd: 20,
          dailyTargets: {
            calories: 2000,
            protein: 150
          }
        }
      },
      "run_weekly",
      context
    );

    expect(result.nodeExecutions.length).toBeGreaterThan(0);
    expect(result.toolInvocations).toEqual([]);
    expect(result.memoryWrites).toEqual([]);
    expect(result.finalOutput).toEqual(expect.objectContaining({
      meals: expect.arrayContaining([
        expect.objectContaining({
          mealType: expect.any(String),
          name: expect.any(String),
          ingredients: expect.any(Array),
          nutrition: {
            calories: expect.any(Number),
            protein: expect.any(Number),
            carbs: expect.any(Number),
            fat: expect.any(Number)
          }
        })
      ]),
      groceryList: expect.arrayContaining([
        expect.objectContaining({
          item: expect.any(String),
          quantity: expect.any(Number),
          unit: expect.any(String),
          estimatedCost: expect.any(Number)
        })
      ]),
      totalCost: expect.any(Number)
    }));

    const validatePlanExecution = result.nodeExecutions.find((execution) => execution.nodeId === "validatePlan");
    expect(validatePlanExecution?.output?.data).toMatchObject({
      score: expect.any(Number),
      passed: expect.any(Boolean),
      issues: expect.any(Array),
      summary: expect.any(String),
      shouldRetry: false
    });
  });

  it("allows an empty grocery list only when pantry covers the full generated plan", async () => {
    const result = await executeDAG(
      weeklyGroceryPlanner.dag,
      {
        preferences: {
          days: 1,
          servings: 2,
          pantry: [
            "greek yogurt",
            "oats",
            "berries",
            "bread",
            "turkey slices",
            "lettuce",
            "tomato",
            "chicken breast",
            "rice",
            "broccoli",
            "apple",
            "almonds"
          ]
        }
      },
      "run_pantry_only",
      context
    );

    expect(result.finalOutput).toMatchObject({
      meals: expect.any(Array),
      groceryList: [],
      totalCost: 0
    });

    const calculateCostsExecution = result.nodeExecutions.find((execution) => execution.nodeId === "calculateCosts");
    expect(calculateCostsExecution?.output?.data).toMatchObject({
      pantryCoverage: {
        totalIngredientCount: expect.any(Number),
        coveredIngredientCount: expect.any(Number),
        uncoveredIngredientCount: 0,
        fullyCovered: true
      }
    });

    const validatePlanExecution = result.nodeExecutions.find((execution) => execution.nodeId === "validatePlan");
    expect(validatePlanExecution?.input).toMatchObject({
      pantryCoverage: {
        fullyCovered: true
      }
    });
  });

  it("accepts desired meal preferences in the DAG input", async () => {
    const result = await executeDAG(
      weeklyGroceryPlanner.dag,
      {
        preferences: {
          days: 1,
          servings: 1,
          desiredMeals: {
            breakfast: "oatmeal with honey and almonds"
          }
        }
      },
      "run_desired_meals",
      context
    );

    expect(result.finalOutput).toMatchObject({
      meals: expect.any(Array),
      groceryList: expect.any(Array),
      totalCost: expect.any(Number)
    });
    expect((result.finalOutput as { meals: unknown[] }).meals).toHaveLength(4);
  });

  it("accepts weekly meat frequency preferences in the DAG input", async () => {
    const result = await executeDAG(
      weeklyGroceryPlanner.dag,
      {
        preferences: {
          days: 1,
          servings: 1,
          desiredWeeklyPatterns: {
            meatMealsPerWeek: 3
          }
        }
      },
      "run_weekly_meat_pref",
      context
    );

    expect(result.finalOutput).toMatchObject({
      meals: expect.any(Array),
      groceryList: expect.any(Array),
      totalCost: expect.any(Number)
    });
    expect((result.finalOutput as { meals: unknown[] }).meals).toHaveLength(4);
  });
});
