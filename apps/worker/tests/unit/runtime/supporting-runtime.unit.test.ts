import { describe, expect, it } from "vitest";
import type { AgentDefinition, Job } from "@personal-agent-os/shared";
import { dailyBriefing } from "@personal-agent-os/agent-sdk";
import { evaluateRun } from "../../../src/runtime/evaluator.js";
import { updateMemory } from "../../../src/runtime/memory.js";
import { planJob } from "../../../src/runtime/planner.js";

describe("supporting runtime helpers", () => {
  it("builds a plan from the agent definition and job", () => {
    const agent = dailyBriefing as AgentDefinition;
    const job: Job = {
      id: "job_1",
      userId: "user_1",
      name: "Founder Daily Briefing",
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

  it("creates evaluation and memory payloads from output", () => {
    const output = {
      summary: "Briefing summary",
      destination: "demo@example.com"
    };

    expect(evaluateRun(output)).toMatchObject({
      score: expect.any(Number),
      summary: expect.any(String)
    });
    expect(updateMemory("job_1", output)).toMatchObject({
      jobId: "job_1",
      key: "latest-output",
      value: output
    });
  });
});
