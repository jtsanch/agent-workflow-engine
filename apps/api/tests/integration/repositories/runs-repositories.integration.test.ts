import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Job, JobMemory, JobRun, NodeExecution, NodeFeedback, ToolInvocation } from "@personal-agent-os/shared";
import { usersTable } from "../../../src/db/schema/index.js";
import {
  PostgresJobMemoryRepository,
  PostgresJobRepository,
  PostgresJobRunRepository,
  PostgresNodeExecutionRepository,
  PostgresNodeFeedbackRepository,
  PostgresToolInvocationRepository
} from "../../../src/repositories/postgres/index.js";
import { createRepositoryTestContext } from "./postgres-testcontainer.js";

describe("postgres run repositories", () => {
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

  async function seedJob(userId: string, jobId: string): Promise<Job> {
    const nowDate = new Date("2026-05-10T00:00:00.000Z");
    await context.database.db.insert(usersTable).values({
      id: userId,
      email: `${userId}@example.com`,
      firstName: "Test",
      lastName: "User",
      clerkUserId: `clerk_${userId}`,
      status: "active",
      role: "user",
      createdAt: nowDate,
      updatedAt: nowDate
    });
    const job: Job = {
      id: jobId,
      userId,
      name: "Run job",
      dagId: "dag_grocery_planner",
      agentDefinitionKey: "grocery-planner",
      status: "active",
      inputs: {},
      createdAt: nowDate.toISOString(),
      updatedAt: nowDate.toISOString()
    };
    await new PostgresJobRepository(context.database).create(job);
    return job;
  }

  it("persists and lists job runs scoped to a user", async () => {
    const repository = new PostgresJobRunRepository(context.database);
    await seedJob("00000000-0000-0000-0000-000000000001", "job_1");
    await seedJob("00000000-0000-0000-0000-000000000002", "job_2");
    const run1: JobRun = {
      id: "run_1",
      jobId: "job_1",
      status: "queued",
      triggerSource: "manual",
      startedAt: "2026-05-10T00:00:01.000Z"
    };
    const run2: JobRun = {
      id: "run_2",
      jobId: "job_2",
      status: "queued",
      triggerSource: "manual",
      startedAt: "2026-05-10T00:00:02.000Z"
    };

    await repository.create(run1);
    await repository.create(run2);
    await repository.update({
      ...run1,
      status: "succeeded",
      completedAt: "2026-05-10T00:00:04.000Z",
      output: { data: { done: true }, artifacts: [] }
    });

    const userRuns = await repository.listByUser("00000000-0000-0000-0000-000000000001");
    expect(userRuns).toHaveLength(1);
    expect(userRuns[0]).toEqual(
      expect.objectContaining({
        id: "run_1",
        status: "succeeded",
        output: { data: { done: true }, artifacts: [] }
      })
    );
  });

  it("persists node executions, tool invocations, and node feedback", async () => {
    const runRepository = new PostgresJobRunRepository(context.database);
    const nodeExecutionRepository = new PostgresNodeExecutionRepository(context.database);
    const toolInvocationRepository = new PostgresToolInvocationRepository(context.database);
    const nodeFeedbackRepository = new PostgresNodeFeedbackRepository(context.database);
    await seedJob("00000000-0000-0000-0000-000000000003", "job_3");
    const run: JobRun = {
      id: "run_3",
      jobId: "job_3",
      status: "running",
      triggerSource: "manual",
      startedAt: "2026-05-10T00:00:01.000Z"
    };
    const nodeExecution: NodeExecution = {
      id: "exec_1",
      jobRunId: run.id,
      nodeId: "node_1",
      nodeType: "tool",
      nodeVersion: "1.0.0",
      status: "succeeded",
      input: { query: "hello" },
      resolvedInput: { query: "hello" },
      output: { data: { result: "ok" }, artifacts: [] },
      latencyMs: 15,
      tokenUsage: 10,
      costUsd: 0.01,
      retryCount: 0,
      startedAt: "2026-05-10T00:00:02.000Z",
      completedAt: "2026-05-10T00:00:03.000Z"
    };
    const toolInvocation: ToolInvocation = {
      id: "tool_1",
      nodeExecutionId: nodeExecution.id,
      toolName: "web_search",
      request: { query: "hello" },
      response: { answer: "ok" },
      status: "succeeded",
      createdAt: "2026-05-10T00:00:03.000Z"
    };
    const feedback: NodeFeedback = {
      id: "feedback_1",
      nodeExecutionId: nodeExecution.id,
      sourceNodeId: "node_1",
      targetNodeId: "node_2",
      score: 1,
      shouldRetry: false,
      summary: "all good",
      createdAt: "2026-05-10T00:00:04.000Z"
    };

    await runRepository.create(run);
    await nodeExecutionRepository.createMany([nodeExecution]);
    await toolInvocationRepository.createMany([toolInvocation]);
    await nodeFeedbackRepository.createMany([feedback]);

    await expect(nodeExecutionRepository.listByRunIds([run.id])).resolves.toEqual([nodeExecution]);
    await expect(toolInvocationRepository.listByExecutionIds([nodeExecution.id])).resolves.toEqual([toolInvocation]);
    await expect(nodeFeedbackRepository.listByExecutionIds([nodeExecution.id])).resolves.toEqual([feedback]);
    await expect(nodeFeedbackRepository.listByRunId(run.id)).resolves.toEqual([feedback]);
  });

  it("upserts job memories by (jobId, key)", async () => {
    const repository = new PostgresJobMemoryRepository(context.database);
    await seedJob("00000000-0000-0000-0000-000000000004", "job_4");
    const firstMemory: JobMemory = {
      id: "memory_1",
      jobId: "job_4",
      key: "latest-output",
      value: { value: 1 },
      updatedAt: "2026-05-10T00:00:03.000Z"
    };
    const updatedMemory: JobMemory = {
      ...firstMemory,
      id: "memory_2",
      value: { value: 2 },
      updatedAt: "2026-05-10T00:00:05.000Z"
    };

    await repository.upsert(firstMemory);
    await repository.upsert(updatedMemory);

    await expect(repository.listByJobId("job_4")).resolves.toEqual([
      {
        id: "memory_1",
        jobId: "job_4",
        key: "latest-output",
        value: { value: 2 },
        updatedAt: "2026-05-10T00:00:05.000Z"
      }
    ]);
  });
});
