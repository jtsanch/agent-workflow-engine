import { defineAgent } from "./types.js";
import type { AgentDefinition } from "@personal-agent-os/shared";

export const weeklyGroceryPlanner = defineAgent({
  id: "agent-weekly-grocery-planner",
  key: "weekly-grocery-planner",
  version: "2.0.0",
  name: "Weekly Grocery Planner",
  description: "Plans a grocery week through a DAG of research, planning, and review nodes.",
  inputSchema: {
    title: "Weekly Grocery Input",
    fields: [
      { name: "householdSize", type: "number", required: true },
      { name: "budget", type: "number", required: true },
      { name: "zipcode", type: "string", required: true },
      { name: "email", type: "string", required: true },
      { name: "dietStyle", type: "string" },
      { name: "notes", type: "string" }
    ]
  },
  uiSchema: {
    version: "1",
    title: "Weekly Grocery Planner",
    description: "Set preferences for a recurring grocery planning workflow.",
    sections: [
      {
        title: "Profile",
        fields: [
          { name: "householdSize", label: "Household Size", type: "number", required: true, defaultValue: 2 },
          { name: "budget", label: "Weekly Budget", type: "number", required: true, defaultValue: 125 },
          { name: "zipcode", label: "Zip Code", type: "text", required: true, placeholder: "94107" },
          { name: "email", label: "Delivery Email", type: "text", required: true, placeholder: "you@example.com" }
        ]
      },
      {
        title: "Preferences",
        fields: [
          {
            name: "dietStyle",
            label: "Diet Style",
            type: "select",
            required: true,
            options: [
              { label: "Balanced", value: "balanced" },
              { label: "Vegetarian", value: "vegetarian" },
              { label: "High Protein", value: "high-protein" }
            ],
            defaultValue: "balanced"
          },
          {
            name: "notes",
            label: "Notes",
            type: "textarea",
            required: false,
            placeholder: "Exclude peanuts, prefer fast dinners..."
          }
        ]
      }
    ]
  },
  dag: {
    id: "dag-weekly-grocery-planner",
    version: "1.0.0",
    name: "Weekly Grocery Planning DAG",
    entryNodeIds: ["deals_agent"],
    exitNodeId: "reviewer",
    nodes: [
      {
        id: "deals_agent",
        type: "tool",
        agentKey: "web_search.search",
        name: "Deals Search",
        description: "Finds grocery deals and seasonal ingredients.",
        inputMapping: {
          query: "$job.zipcode"
        },
        outputSchema: {
          title: "Deals Output",
          fields: [{ name: "results", type: "array", required: true }]
        }
      },
      {
        id: "nutrition_agent",
        type: "llm",
        agentKey: "llm.generateText",
        name: "Nutrition Planner",
        inputMapping: {
          prompt: "deals_agent.results"
        },
        outputSchema: {
          title: "Nutrition Output",
          fields: [{ name: "text", type: "string", required: true }]
        }
      },
      {
        id: "price_agent",
        type: "llm",
        agentKey: "llm.generateText",
        name: "Price Planner",
        inputMapping: {
          prompt: "deals_agent.results"
        },
        outputSchema: {
          title: "Price Output",
          fields: [{ name: "text", type: "string", required: true }]
        }
      },
      {
        id: "meal_planner",
        type: "llm",
        agentKey: "llm.generateText",
        name: "Meal Planner",
        inputMapping: {
          prompt: "nutrition_agent.text",
          priceContext: "price_agent.text",
          deals: "deals_agent.results",
          notes: "$job.notes"
        },
        outputSchema: {
          title: "Meal Plan",
          fields: [{ name: "text", type: "string", required: true }]
        }
      },
      {
        id: "reviewer",
        type: "evaluator",
        agentKey: "reviewer",
        name: "Plan Reviewer",
        inputMapping: {
          candidate: "meal_planner.text",
          budget: "$job.budget"
        },
        outputSchema: {
          title: "Review Output",
          fields: [
            { name: "score", type: "number", required: true },
            { name: "shouldRetry", type: "boolean", required: true },
            { name: "summary", type: "string", required: true }
          ]
        },
        retryPolicy: {
          maxRetries: 1,
          strategy: "feedback"
        }
      }
    ],
    edges: [
      { from: "deals_agent", to: "nutrition_agent", type: "data" },
      { from: "deals_agent", to: "price_agent", type: "data" },
      { from: "deals_agent", to: "meal_planner", type: "data" },
      { from: "nutrition_agent", to: "meal_planner", type: "data" },
      { from: "price_agent", to: "meal_planner", type: "data" },
      { from: "meal_planner", to: "reviewer", type: "data" },
      { from: "reviewer", to: "meal_planner", type: "feedback" }
    ]
  },
  defaultSchedule: "cron(0 9 ? * SUN *)",
  alertPreferences: [
    {
      id: "agent-alert-weekly-grocery",
      channel: "email",
      destination: "demo@example.com",
      onSuccess: true,
      onFailure: true
    }
  ],
  promptTemplate: "Prepare the grocery planning output for {{jobName}}.",
  tags: ["shopping", "planning", "dag"]
});

export const seedAgentDefinitions: AgentDefinition[] = [weeklyGroceryPlanner];
