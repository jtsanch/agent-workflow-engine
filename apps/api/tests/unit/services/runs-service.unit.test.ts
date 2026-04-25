import { describe, expect, it } from "vitest";
import type { CreateJobInput, UserContext } from "@personal-agent-os/shared";
import { createSeedTables } from "../../../src/db/seed.js";
import { InMemoryDatabase } from "../../../src/db/database.js";
import {
  InMemoryAlertPreferenceRepository,
  InMemoryJobMemoryRepository,
  InMemoryJobRepository,
  InMemoryJobRunRepository,
  InMemoryJobRunStepRepository,
  InMemoryJobScheduleRepository,
  InMemoryNodeExecutionRepository,
  InMemoryNodeFeedbackRepository,
  InMemoryToolInvocationRepository
} from "../../../src/repositories/memory.js";
import { AgentCatalogService } from "../../../src/services/agent-catalog.js";
import { JobsService } from "../../../src/services/jobs-service.js";
import { RunsService } from "../../../src/services/runs-service.js";

const userContext: UserContext = {
  userId: "user_test",
  email: "test@example.com"
};

const createJobInput: CreateJobInput = {
  agentDefinitionKey: "grocery-planner",
  dagId: "dag_grocery_planner",
  name: "Grocery Planner",
  scheduleExpression: "cron(0 9 ? * SUN *)",
  timezone: "America/Los_Angeles",
  inputs: {
    preferences: {
      days: 7,
      servings: 2,
      budgetUsd: 100
    }
  },
  alertPreferences: [
    {
      channel: "email",
      destination: "test@example.com",
      onSuccess: true,
      onFailure: true
    }
  ]
};

describe("RunsService", () => {
  it("enqueues and executes runs for an existing job", async () => {
    const database = new InMemoryDatabase(createSeedTables());
    const jobRepository = new InMemoryJobRepository(database);
    const agentCatalogService = new AgentCatalogService();
    const jobsService = new JobsService(
      jobRepository,
      new InMemoryJobScheduleRepository(database),
      new InMemoryAlertPreferenceRepository(database),
      agentCatalogService
    );

    const createdJob = await jobsService.createJob(createJobInput, userContext);

    const runsService = new RunsService(
      jobRepository,
      new InMemoryJobRunRepository(database),
      new InMemoryJobRunStepRepository(database),
      new InMemoryToolInvocationRepository(database),
      new InMemoryNodeExecutionRepository(database),
      new InMemoryNodeFeedbackRepository(database),
      new InMemoryJobMemoryRepository(database),
      agentCatalogService
    );

    const queuedRun = await runsService.enqueueRun(createdJob.id);
    const completedRun = await runsService.executeRun(createdJob.id);
    const runs = await runsService.listRuns(userContext);

    expect(queuedRun.status).toBe("queued");
    expect(completedRun.status).toBe("succeeded");
    expect(completedRun.output?.data).toBeDefined();
    expect(runs).toHaveLength(2);
    expect(runs.some((run) => run.nodeExecutions.length > 0)).toBe(true);
    expect(runs.every((run) => run.toolInvocations.length === 0)).toBe(true);
  });

  it("throws when enqueueing an unknown job", async () => {
    const database = new InMemoryDatabase(createSeedTables());
    const runsService = new RunsService(
      new InMemoryJobRepository(database),
      new InMemoryJobRunRepository(database),
      new InMemoryJobRunStepRepository(database),
      new InMemoryToolInvocationRepository(database),
      new InMemoryNodeExecutionRepository(database),
      new InMemoryNodeFeedbackRepository(database),
      new InMemoryJobMemoryRepository(database),
      new AgentCatalogService()
    );

    await expect(runsService.enqueueRun("missing")).rejects.toMatchObject({
      code: "job_not_found",
      statusCode: 404
    });
  });
});
