import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job, JobRun, NodeExecution, NodeFeedback, UserContext } from "@personal-agent-os/shared";
import type {
  JobMemoryRepository,
  JobRepository,
  JobRunRepository,
  NodeExecutionRepository,
  NodeFeedbackRepository,
  ToolInvocationRepository
} from "../../../src/repositories/interfaces.js";
import { RunsService } from "../../../src/services/runs-service.js";
import type { AgentCatalogService } from "../../../src/services/agent-catalog.js";

vi.mock("@personal-agent-os/agent-sdk", () => ({
  createLlmBudget: vi.fn(() => ({}))
}));

vi.mock("../../../src/worker-compat/tool-registry.js", () => ({
  createDefaultToolRegistry: vi.fn(() => ({}))
}));

vi.mock("../../../src/worker-compat/dag-engine.js", () => ({
  executeDagCompat: vi.fn()
}));

import { executeDagCompat } from "../../../src/worker-compat/dag-engine.js";

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
  createdAt: "2026-05-10T00:00:00.000Z",
  updatedAt: "2026-05-10T00:00:00.000Z"
};

function createRepositories(): {
  jobRepository: JobRepository;
  jobRunRepository: JobRunRepository;
  toolInvocationRepository: ToolInvocationRepository;
  nodeExecutionRepository: NodeExecutionRepository;
  nodeFeedbackRepository: NodeFeedbackRepository;
  jobMemoryRepository: JobMemoryRepository;
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
    },
    jobMemoryRepository: {
      listByJobId: vi.fn(),
      upsert: vi.fn()
    }
  };
}

function createAgentCatalogService(): AgentCatalogService {
  return {
    list: vi.fn(),
    getByKey: vi.fn(() => null),
    getByDagId: vi.fn(() => ({ dag: { id: "dag_grocery_planner" } }))
  } as unknown as AgentCatalogService;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RunsService", () => {
  it("enqueues and executes runs for an existing job", async () => {
    const repositories = createRepositories();
    const agentCatalogService = createAgentCatalogService();
    const createdRuns: JobRun[] = [];
    const executionBase: NodeExecution = {
      id: "exec_1",
      jobRunId: "pending",
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
      startedAt: "2026-05-10T00:00:00.000Z",
      completedAt: "2026-05-10T00:00:01.000Z"
    };
    const nodeFeedback: NodeFeedback = {
      id: "feedback_1",
      nodeExecutionId: "exec_1",
      sourceNodeId: "node_1",
      targetNodeId: "node_2",
      score: 0.9,
      shouldRetry: false,
      summary: "looks good",
      createdAt: "2026-05-10T00:00:01.000Z"
    };
    vi.mocked(repositories.jobRepository.findById).mockResolvedValue(job);
    vi.mocked(repositories.jobRunRepository.create).mockImplementation(async (run) => {
      createdRuns.push(run);
      return run;
    });
    vi.mocked(repositories.jobRunRepository.update).mockImplementation(async (run) => {
      const index = createdRuns.findIndex((entry) => entry.id === run.id);
      if (index >= 0) {
        createdRuns[index] = run;
      }
      return run;
    });
    vi.mocked(repositories.jobRunRepository.listByUser).mockImplementation(async () => [...createdRuns]);
    vi.mocked(repositories.toolInvocationRepository.createMany).mockImplementation(async (records) => records);
    vi.mocked(repositories.nodeExecutionRepository.createMany).mockImplementation(async (records) => records);
    vi.mocked(repositories.nodeFeedbackRepository.createMany).mockImplementation(async (records) => records);
    vi.mocked(repositories.jobMemoryRepository.upsert).mockImplementation(async (record) => record);
    vi.mocked(executeDagCompat).mockResolvedValue({
      finalOutput: { data: { done: true }, artifacts: [] },
      nodeExecutions: [executionBase],
      nodeFeedback: [nodeFeedback],
      toolInvocations: []
    });
    const runsService = new RunsService(
      repositories.jobRepository,
      repositories.jobRunRepository,
      repositories.toolInvocationRepository,
      repositories.nodeExecutionRepository,
      repositories.nodeFeedbackRepository,
      repositories.jobMemoryRepository,
      agentCatalogService
    );

    const queuedRun = await runsService.enqueueRun(userContext, job.id);
    const completedRun = await runsService.executeRun(userContext, job.id);
    vi.mocked(repositories.nodeExecutionRepository.listByRunIds).mockResolvedValue([
      {
        ...executionBase,
        jobRunId: completedRun.id
      }
    ]);
    vi.mocked(repositories.nodeFeedbackRepository.listByExecutionIds).mockResolvedValue([nodeFeedback]);
    vi.mocked(repositories.toolInvocationRepository.listByExecutionIds).mockResolvedValue([]);
    const runs = await runsService.listRuns(userContext);

    expect(queuedRun.status).toBe("queued");
    expect(completedRun.status).toBe("succeeded");
    expect(completedRun.output?.data).toBeDefined();
    expect(runs).toHaveLength(2);
    expect(runs.some((run) => run.nodeExecutions.length > 0)).toBe(true);
    expect(runs.every((run) => run.toolInvocations.length === 0)).toBe(true);
    expect(repositories.jobRepository.findById).toHaveBeenCalledWith(job.id);
    expect(repositories.jobRunRepository.create).toHaveBeenCalledTimes(2);
    expect(repositories.jobRunRepository.update).toHaveBeenCalledOnce();
  });

  it("throws when enqueueing an unknown job", async () => {
    const repositories = createRepositories();
    vi.mocked(repositories.jobRepository.findById).mockResolvedValue(null);
    const runsService = new RunsService(
      repositories.jobRepository,
      repositories.jobRunRepository,
      repositories.toolInvocationRepository,
      repositories.nodeExecutionRepository,
      repositories.nodeFeedbackRepository,
      repositories.jobMemoryRepository,
      createAgentCatalogService()
    );

    await expect(runsService.enqueueRun(userContext, "missing")).rejects.toMatchObject({
      code: "job_not_found",
      statusCode: 404
    });
  });

  it("rejects run access for a job owned by another user", async () => {
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
      repositories.nodeFeedbackRepository,
      repositories.jobMemoryRepository,
      createAgentCatalogService()
    );

    await expect(runsService.executeRun(userContext, job.id)).rejects.toMatchObject({
      code: "job_not_found",
      statusCode: 404
    });
  });
});
