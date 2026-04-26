import { describe, expect, it } from "vitest";
import type { CreateJobInput, UserContext } from "@personal-agent-os/shared";
import { createSeedTables } from "../../../src/db/seed.js";
import { InMemoryDatabase } from "../../../src/db/database.js";
import {
  InMemoryAlertPreferenceRepository,
  InMemoryJobRepository,
  InMemoryJobScheduleRepository
} from "../../../src/repositories/memory.js";
import { AgentCatalogService } from "../../../src/services/agent-catalog.js";
import { JobsService } from "../../../src/services/jobs-service.js";

const userContext: UserContext = {
  userId: "user_test",
  email: "test@example.com"
};

const createJobInput: CreateJobInput = {
  agentDefinitionKey: "grocery-planner",
  name: "Daily Grocery",
  scheduleExpression: "cron(0 9 ? * SUN *)",
  timezone: "America/Los_Angeles",
  dagId: "dag_grocery_planner",
  inputs: {
    preferences: {
      days: 7,
      servings: 2,
      budgetUsd: 100,
      dietaryTags: ["balanced"]
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

describe("JobsService", () => {
  it("creates a job with schedule and alert preferences", async () => {
    const database = new InMemoryDatabase(createSeedTables());
    const jobsService = new JobsService(
      new InMemoryJobRepository(database),
      new InMemoryJobScheduleRepository(database),
      new InMemoryAlertPreferenceRepository(database),
      new AgentCatalogService()
    );

    const job = await jobsService.createJob(createJobInput, userContext);
    const jobs = await jobsService.listJobs(userContext);

    expect(job.agentDefinitionKey).toBe("grocery-planner");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.schedule?.scheduleExpression).toBe(createJobInput.scheduleExpression);
    expect(jobs[0]?.alertPreferences).toHaveLength(1);
    expect(jobs[0]?.inputs.preferences).toMatchObject({ days: 7, servings: 2, budgetUsd: 100 });
  });

  it("throws when the agent definition key is unknown", async () => {
    const database = new InMemoryDatabase(createSeedTables());
    const jobsService = new JobsService(
      new InMemoryJobRepository(database),
      new InMemoryJobScheduleRepository(database),
      new InMemoryAlertPreferenceRepository(database),
      new AgentCatalogService()
    );

    await expect(
      jobsService.createJob(
        {
          ...createJobInput,
          agentDefinitionKey: "missing-agent"
        },
        userContext
      )
    ).rejects.toMatchObject({
      code: "agent_not_found",
      statusCode: 404
    });
  });
});
