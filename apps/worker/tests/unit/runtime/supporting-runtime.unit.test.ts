import { describe, expect, it } from "vitest";
import type { AgentDefinition, Job } from "@personal-agent-os/shared";
import { weeklyGroceryPlanner } from "@personal-agent-os/agent-sdk";
import { planJob } from "../../../src/runtime/planner.js";

describe("supporting runtime helpers", () => {
  it("builds a plan from the agent definition and job", () => {
    const agent = weeklyGroceryPlanner as AgentDefinition;
    const job: Job = {
      id: "job_1",
      userId: "user_1",
      name: "Weekly Grocery",
      dagId: agent.dag.id,
      agentDefinitionKey: agent.key,
      status: "active",
      inputs: {},
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z"
    };

    const plan = planJob(agent, job);

    expect(plan.prompt).toContain(job.name);
    expect(plan.toolHints.length).toBeGreaterThan(0);
  });

  it("includes tool and runtime hints in the execution plan", () => {

    const plan = planJob(weeklyGroceryPlanner as AgentDefinition, {
      id: "job_1",
      userId: "user_1",
      name: "Weekly Grocery",
      dagId: weeklyGroceryPlanner.dag.id,
      agentDefinitionKey: weeklyGroceryPlanner.key,
      status: "active",
      inputs: {},
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z"
    });

    expect(plan.toolHints).toContain("transform");
    expect(plan.toolHints).toContain("llm");
  });
});
