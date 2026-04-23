import { describe, expect, it } from "vitest";
import type { Job } from "@personal-agent-os/shared";
import { runJob } from "../../../src/runtime/job-runner.js";

describe("runJob integration", () => {
  it("executes a DAG-backed job and returns execution telemetry", async () => {
    const job: Job = {
      id: "job_weekly_grocery",
      userId: "user_test",
      name: "Weekly Grocery",
      dagId: "dag_grocery_planner",
      agentDefinitionKey: "grocery-planner",
      status: "active",
      inputs: {
        preferences: {
          days: 7,
          servings: 2,
          budgetUsd: 100,
          dietaryTags: ["balanced"]
        }
      },
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z"
    };

    const execution = await runJob(job);

    expect(execution.finalOutput).toMatchObject({
      plan: {
        meals: expect.any(Array),
        groceryList: expect.any(Array),
        totalEstimatedCost: expect.any(Number)
      }
    });
    expect(execution.nodeExecutions.length).toBeGreaterThan(0);
    expect(execution.nodeFeedback).toEqual([]);
    expect(execution.toolInvocations).toEqual([]);
    expect(execution.memoryWrites).toEqual([]);
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
