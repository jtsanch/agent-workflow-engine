import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job, JobRun, NodeExecution, NodeFeedback, ToolInvocation, UserContext } from "@personal-agent-os/shared";
import type {
  JobRepository,
  JobRunRepository,
  NodeExecutionRepository,
  NodeFeedbackRepository,
  ToolInvocationRepository
} from "../../../src/repositories/interfaces.js";
import { RunsService } from "../../../src/services/runs-service.js";

const userContext: UserContext = {
  userId: "user_test",
  email: "test@example.com"
};

const job: Job = {
  id: "job_1",
  userId: "user_test",
  name: "Grocery Planner",
  dagId: "dag_grocery_planner",
  agentDefinitionKey: "grocery-planner",
  status: "active",
  inputs: { preferences: { days: 7 } },
  createdAt: "2026-06-07T00:00:00.000Z",
  updatedAt: "2026-06-07T00:00:00.000Z"
};

function createRepositories(): {
  jobRepository: JobRepository;
  jobRunRepository: JobRunRepository;
  toolInvocationRepository: ToolInvocationRepository;
  nodeExecutionRepository: NodeExecutionRepository;
  nodeFeedbackRepository: NodeFeedbackRepository;
} {
  return {
    jobRepository: {
      listByUser: vi.fn(),
      findById: vi.fn(),
      create: vi.fn()
    },
    jobRunRepository: {
      listByUser: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    toolInvocationRepository: {
      listByExecutionIds: vi.fn(),
      createMany: vi.fn()
    },
    nodeExecutionRepository: {
      listByRunId: vi.fn(),
      listByRunIds: vi.fn(),
      createMany: vi.fn()
    },
    nodeFeedbackRepository: {
      listByRunId: vi.fn(),
      listByExecutionIds: vi.fn(),
      createMany: vi.fn()
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RunsService", () => {
  it("enqueues a queued manual run for an owned job", async () => {
    const repositories = createRepositories();
    vi.mocked(repositories.jobRepository.findById).mockResolvedValue(job);
    vi.mocked(repositories.jobRunRepository.create).mockImplementation(async (run) => run);
    const runsService = new RunsService(
      repositories.jobRepository,
      repositories.jobRunRepository,
      repositories.toolInvocationRepository,
      repositories.nodeExecutionRepository,
      repositories.nodeFeedbackRepository
    );

    const queuedRun = await runsService.enqueueRun(userContext, job.id);

    expect(queuedRun.jobId).toBe(job.id);
    expect(queuedRun.status).toBe("queued");
    expect(queuedRun.triggerSource).toBe("manual");
    expect(repositories.jobRepository.findById).toHaveBeenCalledWith(job.id);
    expect(repositories.jobRunRepository.create).toHaveBeenCalledOnce();
  });

  it("hydrates run reads with executions, feedback, and tool invocations", async () => {
    const repositories = createRepositories();
    const run: JobRun = {
      id: "run_1",
      jobId: job.id,
      status: "succeeded",
      triggerSource: "manual",
      startedAt: "2026-06-07T00:00:00.000Z",
      completedAt: "2026-06-07T00:00:05.000Z",
      output: { data: { ok: true }, artifacts: [] }
    };
    const nodeExecution: NodeExecution = {
      id: "exec_1",
      jobRunId: run.id,
      nodeId: "node_1",
      nodeType: "tool",
      nodeVersion: "1.0.0",
      status: "succeeded",
      input: {},
      resolvedInput: {},
      output: { data: { ok: true }, artifacts: [] },
      latencyMs: 10,
      tokenUsage: 0,
      retryCount: 0,
      startedAt: "2026-06-07T00:00:01.000Z",
      completedAt: "2026-06-07T00:00:02.000Z"
    };
    const nodeFeedback: NodeFeedback = {
      id: "feedback_1",
      nodeExecutionId: nodeExecution.id,
      sourceNodeId: "node_1",
      targetNodeId: "node_2",
      score: 0.9,
      shouldRetry: false,
      summary: "looks good",
      createdAt: "2026-06-07T00:00:02.000Z"
    };
    const toolInvocation: ToolInvocation = {
      id: "tool_1",
      nodeExecutionId: nodeExecution.id,
      toolName: "web_search.search",
      request: { query: "milk" },
      response: { results: [] },
      status: "succeeded",
      createdAt: "2026-06-07T00:00:02.000Z"
    };
    vi.mocked(repositories.jobRunRepository.listByUser).mockResolvedValue([run]);
    vi.mocked(repositories.nodeExecutionRepository.listByRunIds).mockResolvedValue([nodeExecution]);
    vi.mocked(repositories.nodeFeedbackRepository.listByExecutionIds).mockResolvedValue([nodeFeedback]);
    vi.mocked(repositories.toolInvocationRepository.listByExecutionIds).mockResolvedValue([toolInvocation]);
    const runsService = new RunsService(
      repositories.jobRepository,
      repositories.jobRunRepository,
      repositories.toolInvocationRepository,
      repositories.nodeExecutionRepository,
      repositories.nodeFeedbackRepository
    );

    const runs = await runsService.listRuns(userContext);
    const hydratedRun = runs[0];

    expect(runs).toHaveLength(1);
    expect(hydratedRun?.nodeExecutions).toEqual([nodeExecution]);
    expect(hydratedRun?.nodeFeedback).toEqual([nodeFeedback]);
    expect(hydratedRun?.toolInvocations).toEqual([toolInvocation]);
  });

  it("throws when enqueueing an unknown job", async () => {
    const repositories = createRepositories();
    vi.mocked(repositories.jobRepository.findById).mockResolvedValue(null);
    const runsService = new RunsService(
      repositories.jobRepository,
      repositories.jobRunRepository,
      repositories.toolInvocationRepository,
      repositories.nodeExecutionRepository,
      repositories.nodeFeedbackRepository
    );

    await expect(runsService.enqueueRun(userContext, "missing")).rejects.toMatchObject({
      code: "job_not_found",
      statusCode: 404
    });
  });

  it("rejects queueing a job owned by another user", async () => {
    const repositories = createRepositories();
    vi.mocked(repositories.jobRepository.findById).mockResolvedValue({
      ...job,
      userId: "other_user"
    });
    const runsService = new RunsService(
      repositories.jobRepository,
      repositories.jobRunRepository,
      repositories.toolInvocationRepository,
      repositories.nodeExecutionRepository,
      repositories.nodeFeedbackRepository
    );

    await expect(runsService.enqueueRun(userContext, job.id)).rejects.toMatchObject({
      code: "job_not_found",
      statusCode: 404
    });
  });
});
