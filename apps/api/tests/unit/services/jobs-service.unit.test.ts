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
  agentDefinitionKey: "daily-briefing",
  name: "My Daily Briefing",
  scheduleExpression: "cron(0 7 ? * MON-FRI *)",
  timezone: "America/Los_Angeles",
  dagId: "dag-daily-briefing",
  inputs: {
    email: "test@example.com",
    tone: "concise",
    includeTodos: true
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

    expect(job.agentDefinitionKey).toBe("daily-briefing");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.schedule?.scheduleExpression).toBe(createJobInput.scheduleExpression);
    expect(jobs[0]?.alertPreferences).toHaveLength(1);
    expect(jobs[0]?.inputs.email).toBe("test@example.com");
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
