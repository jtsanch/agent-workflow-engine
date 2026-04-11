import { describe, expect, it } from "vitest";
import type { Job } from "@personal-agent-os/shared";
import { runJob } from "../../../src/runtime/job-runner.js";

describe("runJob integration", () => {
  it("executes a DAG-backed job and returns evaluation, memory, and node telemetry", async () => {
    const job: Job = {
      id: "job_daily_briefing",
      userId: "user_test",
      name: "Founder Daily Briefing",
      dagId: "dag-daily-briefing",
      agentDefinitionKey: "daily-briefing",
      status: "active",
      inputs: {
        email: "demo@example.com",
        tone: "concise",
        includeTodos: true
      },
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z"
    };

    const execution = await runJob(job);

    expect(execution.result.output).toMatchObject({
      summary: expect.any(String),
      destination: "demo@example.com"
    });
    expect(execution.evaluation).toMatchObject({
      score: expect.any(Number),
      summary: expect.any(String)
    });
    expect(execution.memory).toMatchObject({
      jobId: job.id,
      key: "latest-output"
    });
    expect(execution.nodeExecutions.length).toBeGreaterThan(0);
    expect(execution.nodeFeedback).toEqual([]);
  });

  it("fails fast when the job references an unknown workflow", async () => {
    const job: Job = {
      id: "job_missing",
      userId: "user_test",
      name: "Missing Workflow",
      dagId: "dag-missing",
      agentDefinitionKey: "missing-agent",
      status: "active",
      inputs: {},
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z"
    };

    await expect(runJob(job)).rejects.toThrow("Unknown agent definition for dag: dag-missing");
  });
});
