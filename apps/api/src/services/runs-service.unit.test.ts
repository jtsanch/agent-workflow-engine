import { describe, expect, it } from "vitest";
import type { CreateJobInput, UserContext } from "@personal-agent-os/shared";
import { createSeedTables } from "../db/seed.js";
import { InMemoryDatabase } from "../db/database.js";
import {
  InMemoryAlertPreferenceRepository,
  InMemoryJobMemoryRepository,
  InMemoryJobRepository,
  InMemoryJobRunRepository,
  InMemoryJobRunStepRepository,
  InMemoryJobScheduleRepository,
  InMemoryToolInvocationRepository
} from "../repositories/memory.js";
import { AgentCatalogService } from "./agent-catalog.js";
import { JobsService } from "./jobs-service.js";
import { RunsService } from "./runs-service.js";

const userContext: UserContext = {
  userId: "user_test",
  email: "test@example.com"
};

const createJobInput: CreateJobInput = {
  agentDefinitionKey: "weekly-grocery-planner",
  dagId: "dag-weekly-grocery-planner",
  name: "Weekly Grocery",
  scheduleExpression: "cron(0 9 ? * SUN *)",
  timezone: "America/Los_Angeles",
  inputs: {
    zipcode: "94107",
    email: "test@example.com",
    householdSize: 2,
    budget: 100
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
  it("enqueues and simulates runs for an existing job", async () => {
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
      new InMemoryJobMemoryRepository(database),
      agentCatalogService
    );

    const queuedRun = await runsService.enqueueRun(createdJob.id);
    const completedRun = await runsService.simulateRun(createdJob.id);
    const runs = await runsService.listRuns(userContext);

    expect(queuedRun.status).toBe("queued");
    expect(completedRun.status).toBe("succeeded");
    expect(completedRun.output?.summary).toBeDefined();
    expect(runs).toHaveLength(2);
    expect(runs.some((run) => run.steps.length > 0)).toBe(true);
  });

  it("throws when enqueueing an unknown job", async () => {
    const database = new InMemoryDatabase(createSeedTables());
    const runsService = new RunsService(
      new InMemoryJobRepository(database),
      new InMemoryJobRunRepository(database),
      new InMemoryJobRunStepRepository(database),
      new InMemoryToolInvocationRepository(database),
      new InMemoryJobMemoryRepository(database),
      new AgentCatalogService()
    );

    await expect(runsService.enqueueRun("missing")).rejects.toMatchObject({
      code: "job_not_found",
      statusCode: 404
    });
  });
});
