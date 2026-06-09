import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import type { Job, JobSchedule } from "@personal-agent-os/shared";
import { jobsTable, usersTable } from "../../../src/db/schema/index.js";
import {
  PostgresAlertPreferenceRepository,
  PostgresJobRepository,
  PostgresJobScheduleRepository
} from "../../../src/repositories/postgres/index.js";
import { createRepositoryTestContext } from "./postgres-testcontainer.js";

describe("postgres job repositories", () => {
  let context: Awaited<ReturnType<typeof createRepositoryTestContext>> | undefined;

  beforeAll(async () => {
    context = await createRepositoryTestContext();
  });

  afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  beforeEach(async () => {
    if (!context) {
      throw new Error("Repository test context was not initialized");
    }

    await context.reset();
  });

  async function seedUser(userId: string) {
    const now = new Date("2026-05-10T00:00:00.000Z");
    await context.database.db.insert(usersTable).values({
      id: userId,
      email: `${userId}@example.com`,
      firstName: "Test",
      lastName: "User",
      clerkUserId: `clerk_${userId}`,
      status: "active",
      role: "user",
      createdAt: now,
      updatedAt: now
    });
  }

  it("persists and queries jobs by id and owner", async () => {
    const repository = new PostgresJobRepository(context.database);
    const now = "2026-05-10T00:00:00.000Z";
    await seedUser("00000000-0000-0000-0000-000000000001");
    await seedUser("00000000-0000-0000-0000-000000000002");
    const job: Job = {
      id: "job_1",
      userId: "00000000-0000-0000-0000-000000000001",
      name: "Daily Grocery",
      dagId: "dag_grocery_planner",
      agentDefinitionKey: "grocery-planner",
      status: "active",
      inputs: { preferences: { days: 7 } },
      createdAt: now,
      updatedAt: now
    };
    const otherUserJob: Job = {
      ...job,
      id: "job_2",
      userId: "00000000-0000-0000-0000-000000000002"
    };

    await repository.create(job);
    await repository.create(otherUserJob);

    await expect(repository.findById("job_1")).resolves.toEqual(job);
    await expect(repository.listByUser("00000000-0000-0000-0000-000000000001")).resolves.toEqual([job]);
  });

  it("persists job schedules and alert preferences for a job", async () => {
    const jobRepository = new PostgresJobRepository(context.database);
    const scheduleRepository = new PostgresJobScheduleRepository(context.database);
    const alertPreferenceRepository = new PostgresAlertPreferenceRepository(context.database);
    const now = "2026-05-10T00:00:00.000Z";
    await seedUser("00000000-0000-0000-0000-000000000003");
    await jobRepository.create({
      id: "job_3",
      userId: "00000000-0000-0000-0000-000000000003",
      name: "Weekly planning",
      dagId: "dag_grocery_planner",
      agentDefinitionKey: "grocery-planner",
      status: "active",
      inputs: {},
      createdAt: now,
      updatedAt: now
    });
    const schedule: JobSchedule = {
      id: "schedule_1",
      jobId: "job_3",
      scheduleExpression: "cron(0 9 ? * MON *)",
      timezone: "America/Los_Angeles",
      enabled: true,
      createdAt: now,
      updatedAt: now
    };

    await scheduleRepository.create(schedule);
    await alertPreferenceRepository.createMany([
      {
        id: "alert_1",
        jobId: "job_3",
        channel: "email",
        destination: "user@example.com",
        onSuccess: true,
        onFailure: true
      }
    ]);

    await expect(scheduleRepository.findByJobId("job_3")).resolves.toEqual(schedule);
    await expect(alertPreferenceRepository.listByJobId("job_3")).resolves.toEqual([
      {
        id: "alert_1",
        jobId: "job_3",
        channel: "email",
        destination: "user@example.com",
        onSuccess: true,
        onFailure: true
      }
    ]);
    const persistedJob = await context.database.db.select().from(jobsTable);
    expect(persistedJob).toHaveLength(1);
  });
});
