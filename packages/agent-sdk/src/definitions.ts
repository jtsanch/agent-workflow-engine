import { defineAgent } from "./types.js";
import type { AgentDefinition, TransformNode } from "@personal-agent-os/shared";

const extractIngredientsRun: TransformNode["run"] = async (input) => {
  const meals = Array.isArray(input.meals) ? (input.meals as Array<{ ingredients?: unknown }>) : [];
  const items = new Set<string>();

  for (const meal of meals) {
    const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : [];
    for (const ingredient of ingredients) {
      if (typeof ingredient === "string") {
        items.add(ingredient.toLowerCase());
      }
    }
  }

  const normalizedItems = Array.from(items);

  return {
    items: normalizedItems,
    searchQuery: normalizedItems.join(", ")
  };
};

const finalizePlanRun: TransformNode["run"] = async (input) => {
  return { plan: input.plan };
};

type Plan = {
  meals: { name: string; estimatedCost: number }[];
  groceryList: { item: string; quantity: number; estimatedCost: number }[];
  totalEstimatedCost: number;
};

type ValidateMealPlanInput = {
  plan: Plan;
  budget: number;
};

type ValidateMealPlanOutput = {
  valid: boolean;
  shouldRetry: boolean;
  issues: string[];
  feedback: {
    currentCost: number;
    overBudgetBy?: number;
  };
};

const validateMealPlanRun: TransformNode["run"] = (input) => {
  const { plan, budget } = input as unknown as ValidateMealPlanInput;

  const issues: string[] = [];
  let overBudgetBy: number | undefined;

  // --- Budget validation ---
  if (typeof plan.totalEstimatedCost !== "number") {
    issues.push("totalEstimatedCost must be a number");
  } else if (plan.totalEstimatedCost > budget) {
    overBudgetBy = plan.totalEstimatedCost - budget;
    issues.push(
        `Plan is over budget by ${overBudgetBy.toFixed(2)}`
    );
  }

  // --- Structural validation ---
  if (!Array.isArray(plan.meals) || plan.meals.length === 0) {
    issues.push("Meals must be a non-empty array");
  }

  if (!Array.isArray(plan.groceryList) || plan.groceryList.length === 0) {
    issues.push("Grocery list must be a non-empty array");
  }

  const feedback: ValidateMealPlanOutput["feedback"] = {
    currentCost: plan.totalEstimatedCost
  };

  if (typeof overBudgetBy === "number") {
    feedback.overBudgetBy = overBudgetBy;
  }

  return {
    valid: issues.length === 0,
    shouldRetry: issues.length > 0,
    issues,
    feedback
  } satisfies ValidateMealPlanOutput;
};

export const groceryAgentDefinition: AgentDefinition = defineAgent({
  id: "agent_grocery_planner",
  key: "grocery-planner",
  version: "1.0.0",
  name: "Grocery Planner",
  description:
    "Generates a weekly meal plan, builds a grocery list, estimates cost, and optimizes to fit a budget.",
  inputSchema: {
    type: "object",
    required: ["preferences"],
    properties: {
      preferences: {
        type: "object",
        required: ["days", "servings", "budgetUsd"],
        properties: {
          days: { type: "integer", minimum: 1, maximum: 14 },
          servings: { type: "integer", minimum: 1 },
          budgetUsd: { type: "number", minimum: 1 },
          dietaryTags: {
            type: "array",
            items: { type: "string" }
          },
          allergies: {
            type: "array",
            items: { type: "string" }
          },
          pantry: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  },
  uiSchema: {
    version: "1",
    title: "Grocery Planner",
    description: "Configure meal planning preferences and budget.",
    sections: [
      {
        title: "Plan Preferences",
        fields: [
          { name: "preferences.days", label: "Days", type: "number", required: true, defaultValue: 7 },
          { name: "preferences.servings", label: "Servings", type: "number", required: true, defaultValue: 2 },
          { name: "preferences.budgetUsd", label: "Budget ($)", type: "number", required: true, defaultValue: 100 }
        ]
      },
      {
        title: "Dietary Options",
        fields: [
          {
            name: "preferences.dietaryTags",
            label: "Dietary Tags",
            type: "textarea",
            required: false,
            placeholder: "vegetarian, high-protein"
          },
          {
            name: "preferences.allergies",
            label: "Allergies",
            type: "textarea",
            required: false,
            placeholder: "peanuts, shellfish"
          },
          {
            name: "preferences.pantry",
            label: "Pantry",
            type: "textarea",
            required: false,
            placeholder: "rice, pasta, olive oil"
          }
        ]
      }
    ]
  },
  dag: {
    id: "dag_grocery_planner",
    version: "1.0.0",
    name: "Grocery Planner DAG",
    entryNodeIds: ["generateMeals"],
    exitNodeIds: ["finalizePlan"],
    nodes: [
      {
        id: "generateMeals",
        type: "llm",
        name: "Generate Meals",
        version: "1.0.0",
        promptTemplate: `
You are a meal planner.

Generate meals for {{preferences.days}} days and {{preferences.servings}} servings.
Respect dietaryTags and allergies.

Return JSON:
{
  "meals": [
    { "name": "...", "servings": number, "ingredients": ["..."] }
  ]
}
`,
        input: {
          bindings: [
            {
              key: "preferences",
              ref: { source: "job_input", path: "preferences" }
            }
          ]
        },
        output: {
          schema: {
            type: "object",
            required: ["meals"],
            properties: {
              meals: {
                type: "array",
                items: {
                  type: "object",
                  required: ["name", "servings", "ingredients"],
                  properties: {
                    name: { type: "string" },
                    servings: { type: "number" },
                    ingredients: {
                      type: "array",
                      items: { type: "string" }
                    }
                  }
                }
              }
            }
          },
          outputKind: "structured"
        },
        outputConfig: {
          schema: {
            type: "object",
            required: ["meals"],
            properties: {
              meals: {
                type: "array",
                items: {
                  type: "object",
                  required: ["name", "servings", "ingredients"],
                  properties: {
                    name: { type: "string" },
                    servings: { type: "number" },
                    ingredients: {
                      type: "array",
                      items: { type: "string" }
                    }
                  }
                }
              }
            }
          },
          enforcement: "strict"
        }
      },
      {
        id: "extractIngredients",
        type: "transform",
        name: "Extract Ingredients",
        version: "1.0.0",
        input: {
          bindings: [
            {
              key: "meals",
              ref: {
                source: "node_output",
                nodeId: "generateMeals",
                path: "meals"
              }
            }
          ]
        },
        output: {
          schema: {
            type: "object",
            required: ["items", "searchQuery"],
            properties: {
              items: {
                type: "array",
                items: { type: "string" }
              },
              searchQuery: { type: "string" }
            }
          }
        },
        run: extractIngredientsRun
      },
      {
        id: "priceLookup",
        type: "tool",
        name: "Lookup Prices",
        version: "1.0.0",
        toolName: "web_search.search",
        input: {
          bindings: [
            {
              key: "query",
              ref: {
                source: "node_output",
                nodeId: "extractIngredients",
                path: "searchQuery"
              }
            }
          ]
        },
        output: {
          schema: {
            type: "object",
            required: ["results"],
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  required: ["title", "url", "snippet"],
                  properties: {
                    title: { type: "string" },
                    url: { type: "string" },
                    snippet: { type: "string" }
                  }
                }
              }
            }
          }
        }
      },
      {
        id: "optimizePlan",
        type: "llm",
        name: "Optimize Plan",
        version: "1.0.0",
        promptTemplate: `
You are optimizing a meal plan to fit within a budget.

Inputs:
- meals (initial meal ideas)
- prices (ingredient prices)
- budget (number)
- feedback (optional)

Instructions:
1. Generate a meal plan using the provided meals and prices
2. Ensure totalEstimatedCost <= budget
3. If feedback is provided:
   - Fix ALL issues listed
   - If overBudgetBy is present, reduce cost by at least that amount
   - Prefer cheaper ingredients or fewer meals if needed
   - Do NOT repeat the same plan

Return STRICT JSON:

{
  "meals": [
    {
      "name": string,
      "estimatedCost": number
    }
  ],
  "groceryList": [
    {
      "item": string,
      "quantity": number,
      "estimatedCost": number
    }
  ],
  "totalEstimatedCost": number,
  "reasoning": string
}
`,
        input: {
          bindings: [
            {
              key: "meals",
              ref: {
                source: "node_output",
                nodeId: "generateMeals",
                path: "meals"
              }
            },
            {
              key: "prices",
              ref: {
                source: "node_output",
                nodeId: "priceLookup",
                path: "results"
              }
            },
            {
              key: "budget",
              ref: { source: "job_input", path: "preferences.budgetUsd" }
            },
            {
              key: "feedback",
              optional: true,
              ref: {
                source: "node_output",
                nodeId: "validatePlan",
              }
            }
          ]
        },
        output: {
          schema: {
            type: "object",
            required: ["meals", "groceryList", "totalEstimatedCost"],
            properties: {
              meals: {
                type: "array",
                items: {
                  type: "object",
                  required: ["name", "estimatedCost"],
                  properties: {
                    name: { type: "string" },
                    estimatedCost: { type: "number" }
                  }
                }
              },
              groceryList: {
                type: "array",
                items: {
                  type: "object",
                  required: ["item", "quantity", "estimatedCost"],
                  properties: {
                    item: { type: "string" },
                    quantity: { type: "number" },
                    estimatedCost: { type: "number" }
                  }
                }
              },
              totalEstimatedCost: { type: "number" },
              reasoning: { type: "string" }
            }
          }
        },
        outputConfig: {
          schema: {
            type: "object",
            required: ["meals", "groceryList", "totalEstimatedCost"],
            properties: {
              meals: {
                type: "array",
                items: {
                  type: "object",
                  required: ["name", "estimatedCost"],
                  properties: {
                    name: { type: "string" },
                    estimatedCost: { type: "number" }
                  }
                }
              },
              groceryList: {
                type: "array",
                items: {
                  type: "object",
                  required: ["item", "quantity", "estimatedCost"],
                  properties: {
                    item: { type: "string" },
                    quantity: { type: "number" },
                    estimatedCost: { type: "number" }
                  }
                }
              },
              totalEstimatedCost: { type: "number" },
              reasoning: { type: "string" }
            }
          },
          enforcement: "strict"
        }
      },
      {
        id: "validatePlan",
        type: "transform",
        name: "Validate Plan",
        version: "1.0.0",
        input: {
          bindings: [
            {
              key: "plan",
              ref: {
                source: "node_output",
                nodeId: "optimizePlan"
              }
            },
            {
              key: "budget",
              ref: {
                source: "job_input",
                path: "preferences.budgetUsd"
              }
            }
          ]
        },
        output: {
          schema: {
            type: "object",
            required: ["valid", "shouldRetry", "issues"],
            properties: {
              valid: { type: "boolean" },
              shouldRetry: { type: "boolean" },
              issues: {
                type: "array",
                items: { type: "string" }
              },
              feedback: {
                type: "object",
                properties: {
                  overBudgetBy: { type: "number" },
                  currentCost: { type: "number" }
                }
              }
            }
          }
        },
        run: validateMealPlanRun
      },
      {
        id: "finalizePlan",
        type: "transform",
        name: "Finalize Plan",
        version: "1.0.0",
        input: {
          bindings: [
            {
              key: "plan",
              ref: {
                source: "node_output",
                nodeId: "optimizePlan"
              }
            }
          ]
        },
        output: {
          schema: {
            type: "object",
            required: ["plan"],
            properties: {
              plan: { type: "object" }
            }
          }
        },
        run: finalizePlanRun
      }
    ],
    edges: [
      { id: "e1", from: "generateMeals", to: "extractIngredients", type: "data" },
      { id: "e2", from: "extractIngredients", to: "priceLookup", type: "data" },
      { id: "e3", from: "priceLookup", to: "optimizePlan", type: "data" },
      { id: "e4", from: "optimizePlan", to: "validatePlan", type: "data" },
      { id: "e5", from: "validatePlan", to: "optimizePlan", type: "feedback" },
      { id: "e6", from: "validatePlan", to: "finalizePlan", type: "data" }
    ]
  }
});

export const weeklyGroceryPlanner = groceryAgentDefinition;

export const seedAgentDefinitions: AgentDefinition[] = [groceryAgentDefinition];
