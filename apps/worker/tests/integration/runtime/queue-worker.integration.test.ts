import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeExecution, NodeFeedback } from "@personal-agent-os/shared";

vi.mock("../../../src/runtime/job-runner.js", () => ({
  runJob: vi.fn()
}));

import { processQueuedRun } from "../../../src/runtime/queue-worker.js";
import { DAGExecutionError } from "../../../src/runtime/dag-engine.js";
import { runJob } from "../../../src/runtime/job-runner.js";
import type {
  ClaimedRunRecord,
  FinalizeRunRecord,
  UsageStateRecord,
  WorkerPersistenceRepository
} from "../../../src/repositories/interfaces.js";
import { RunOwnershipLostError as LostOwnershipError } from "../../../src/repositories/interfaces.js";

const runJobMock = vi.mocked(runJob);

type FakeJobRun = {
  id: string;
  jobId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  queuedAt?: string;
  startedAt: string;
  completedAt?: string;
  claimedAt?: string;
  claimedByWorkerId?: string | null;
  errorMessage?: string | null;
  output?: unknown;
};

type FakeJob = ClaimedRunRecord["job"];

type FakeUsageCounters = {
  dailyTokens: number;
  monthlyTokens: number;
  lastDailyReset: string;
  lastMonthlyReset: string;
};

type FakeUsageLimits = {
  dailyTokenLimit: number;
  monthlyTokenLimit: number;
};

type FakeUsageEvent = {
  userId: string;
  jobId: string;
  jobRunId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  createdAt: string;
};

class FakeWorkerPersistenceRepository implements WorkerPersistenceRepository {
  private readonly workerId = "worker_test";

  readonly state: {
    jobRuns: FakeJobRun[];
    jobs: FakeJob[];
    usageCounters: Map<string, FakeUsageCounters>;
    usageLimits: Map<string, FakeUsageLimits>;
    usageEvents: FakeUsageEvent[];
    nodeFeedback: NodeFeedback[];
    loseOwnershipRuns: Set<string>;
  };

  constructor(state: FakeWorkerPersistenceRepository["state"]) {
    this.state = state;
  }

  async prepareRunForExecution(runId: string): Promise<ClaimedRunRecord | null> {
    const run = this.state.jobRuns.find((candidate) => candidate.id === runId);
    if (!run || (run.status !== "queued" && run.status !== "running")) {
      return null;
    }

    const job = this.state.jobs.find((candidate) => candidate.id === run.jobId);
    if (!job) {
      return null;
    }

    run.status = "running";
    run.claimedAt = new Date().toISOString();
    run.claimedByWorkerId = this.workerId;
    run.completedAt = undefined;
    run.errorMessage = null;
    run.output = undefined;

    return {
      runId: run.id,
      job
    };
  }

  async failRun(runId: string, errorMessage: string, completedAt?: string): Promise<void> {
    const run = this.requireOwnedRun(runId);
    run.status = "failed";
    run.errorMessage = errorMessage;
    run.completedAt = completedAt ?? new Date().toISOString();
    run.claimedByWorkerId = null;
  }

  async loadUsageState(userId: string): Promise<UsageStateRecord> {
    const counters = this.state.usageCounters.get(userId);
    const limits = this.state.usageLimits.get(userId);

    if (!counters || !limits) {
      throw new Error("Usage state not found");
    }

    return {
      dailyUsed: counters.dailyTokens,
      dailyLimit: limits.dailyTokenLimit,
      monthlyUsed: counters.monthlyTokens,
      monthlyLimit: limits.monthlyTokenLimit,
      lastDailyReset: counters.lastDailyReset,
      lastMonthlyReset: counters.lastMonthlyReset
    };
  }

  async updateUsageState(userId: string, state: UsageStateRecord): Promise<void> {
    const counters = this.state.usageCounters.get(userId);
    if (!counters) {
      return;
    }

    counters.dailyTokens = state.dailyUsed;
    counters.monthlyTokens = state.monthlyUsed;
    counters.lastDailyReset = state.lastDailyReset;
    counters.lastMonthlyReset = state.lastMonthlyReset;
  }

  async persistNodeExecutions(nodeExecutions: NodeExecution[]): Promise<void> {
    const runId = nodeExecutions[0]?.jobRunId;
    if (runId) {
      this.requireOwnedRun(runId);
    }
  }

  async persistNodeFeedback(runId: string, nodeFeedback: NodeFeedback[]): Promise<void> {
    this.requireOwnedRun(runId);
    this.state.nodeFeedback.push(...nodeFeedback);
  }

  async persistToolInvocations(runId: string): Promise<void> {
    this.requireOwnedRun(runId);
  }

  async upsertJobMemories(runId: string): Promise<void> {
    this.requireOwnedRun(runId);
  }

  async finalizeRun(record: FinalizeRunRecord): Promise<void> {
    const run = this.requireOwnedRun(record.runId);

    if (record.usageEvents.length > 0) {
      const counters = this.state.usageCounters.get(record.userId);
      const totalTokens = record.usageEvents.reduce((sum, usageEvent) => sum + usageEvent.totalTokens, 0);
      if (counters) {
        counters.dailyTokens += totalTokens;
        counters.monthlyTokens += totalTokens;
      }

      this.state.usageEvents.push(
        ...record.usageEvents.map((usageEvent) => ({
          userId: record.userId,
          jobId: record.jobId,
          jobRunId: record.runId,
          model: usageEvent.model,
          promptTokens: usageEvent.promptTokens,
          completionTokens: usageEvent.completionTokens,
          totalTokens: usageEvent.totalTokens,
          createdAt: usageEvent.createdAt
        }))
      );
    }

    run.status = record.jobStatus;
    run.completedAt = record.completedAt;
    run.claimedByWorkerId = null;

    if (record.jobStatus === "succeeded") {
      run.output = record.finalOutput;
      run.errorMessage = null;
    } else {
      run.errorMessage = record.errorMessage;
    }
  }

  private requireOwnedRun(runId: string): FakeJobRun {
    const run = this.state.jobRuns.find((candidate) => candidate.id === runId);
    if (!run || run.status !== "running" || run.claimedByWorkerId !== this.workerId) {
      throw new LostOwnershipError(runId);
    }

    if (this.state.loseOwnershipRuns.has(runId)) {
      run.claimedByWorkerId = "worker_other";
      throw new LostOwnershipError(runId);
    }

    return run;
  }
}

function createRepositoryState(
  overrides?: Partial<FakeWorkerPersistenceRepository["state"]>
): FakeWorkerPersistenceRepository["state"] {
  return {
    jobRuns: [
      {
        id: "run_1",
        jobId: "job_1",
        status: "queued",
        queuedAt: "2026-05-02T00:00:00.000Z",
        startedAt: "2026-05-02T00:00:00.000Z"
      }
    ],
    jobs: [
      {
        id: "job_1",
        userId: "user_1",
        dagId: "dag_grocery_planner",
        agentDefinitionKey: "grocery-planner",
        name: "Daily Grocery",
        status: "active",
        inputs: {},
        createdAt: "2026-05-02T00:00:00.000Z",
        updatedAt: "2026-05-02T00:00:00.000Z"
      }
    ],
    usageCounters: new Map([
      [
        "user_1",
        {
          dailyTokens: 0,
          monthlyTokens: 0,
          lastDailyReset: "2026-05-02T00:00:00.000Z",
          lastMonthlyReset: "2026-05-01T00:00:00.000Z"
        }
      ]
    ]),
    usageLimits: new Map([
      [
        "user_1",
        {
          dailyTokenLimit: 60000,
          monthlyTokenLimit: 300000
        }
      ]
    ]),
    usageEvents: [],
    nodeFeedback: [],
    loseOwnershipRuns: new Set<string>(),
    ...overrides
  };
}

describe("queue-worker integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-02T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects queued runs that are already over quota before execution", async () => {
    const repository = new FakeWorkerPersistenceRepository(
      createRepositoryState({
        usageCounters: new Map([
          [
            "user_1",
            {
              dailyTokens: 60000,
              monthlyTokens: 1000,
              lastDailyReset: "2026-05-02T00:00:00.000Z",
              lastMonthlyReset: "2026-05-01T00:00:00.000Z"
            }
          ]
        ])
      })
    );

    await processQueuedRun(repository, { runId: "run_1" });

    expect(runJobMock).not.toHaveBeenCalled();
    expect(repository.state.jobRuns[0]).toMatchObject({
      status: "failed",
      errorMessage: "Quota exceeded"
    });
    expect(repository.state.usageEvents).toEqual([]);
  });

  it("records usage events and increments counters consistently after execution", async () => {
    runJobMock.mockResolvedValueOnce({
      nodeExecutions: [],
      nodeFeedback: [
        {
          id: "feedback_1",
          nodeExecutionId: "nodeexec_1",
          sourceNodeId: "validatePlan",
          targetNodeId: "",
          score: 1,
          shouldRetry: false,
          summary: "Looks good",
          createdAt: "2026-05-02T01:00:00.000Z"
        }
      ],
      toolInvocations: [],
      memoryWrites: [],
      finalOutput: { ok: true },
      usageEvents: [
        {
          model: "gpt-4.1",
          promptTokens: 100,
          completionTokens: 40,
          totalTokens: 140,
          createdAt: "2026-05-02T01:00:00.000Z"
        }
      ]
    } as never);

    const repository = new FakeWorkerPersistenceRepository(
      createRepositoryState({
        usageCounters: new Map([
          [
            "user_1",
            {
              dailyTokens: 100,
              monthlyTokens: 200,
              lastDailyReset: "2026-05-02T00:00:00.000Z",
              lastMonthlyReset: "2026-05-01T00:00:00.000Z"
            }
          ]
        ])
      })
    );

    await processQueuedRun(repository, { runId: "run_1" });

    expect(repository.state.jobRuns[0]?.status).toBe("succeeded");
    expect(repository.state.nodeFeedback).toHaveLength(1);
    expect(repository.state.usageEvents).toHaveLength(1);
    expect(repository.state.usageCounters.get("user_1")).toMatchObject({
      dailyTokens: 240,
      monthlyTokens: 340
    });
  });

  it("handles back-to-back executions with best-effort quota enforcement", async () => {
    runJobMock.mockResolvedValueOnce({
      nodeExecutions: [],
      nodeFeedback: [],
      toolInvocations: [],
      memoryWrites: [],
      finalOutput: { ok: true },
      usageEvents: [
        {
          model: "gpt-4.1",
          promptTokens: 100,
          completionTokens: 40,
          totalTokens: 140,
          createdAt: "2026-05-02T01:00:00.000Z"
        }
      ]
    } as never);

    const repository = new FakeWorkerPersistenceRepository(
      createRepositoryState({
        jobRuns: [
          {
            id: "run_1",
            jobId: "job_1",
            status: "queued",
            queuedAt: "2026-05-02T00:00:00.000Z",
            startedAt: "2026-05-02T00:00:00.000Z"
          },
          {
            id: "run_2",
            jobId: "job_1",
            status: "queued",
            queuedAt: "2026-05-02T00:00:01.000Z",
            startedAt: "2026-05-02T00:00:01.000Z"
          }
        ],
        usageCounters: new Map([
          [
            "user_1",
            {
              dailyTokens: 59900,
              monthlyTokens: 1000,
              lastDailyReset: "2026-05-02T00:00:00.000Z",
              lastMonthlyReset: "2026-05-01T00:00:00.000Z"
            }
          ]
        ])
      })
    );

    await processQueuedRun(repository, { runId: "run_1" });
    await processQueuedRun(repository, { runId: "run_2" });

    expect(runJobMock).toHaveBeenCalledTimes(1);
    expect(repository.state.jobRuns[0]).toMatchObject({ status: "succeeded" });
    expect(repository.state.jobRuns[1]).toMatchObject({
      status: "failed",
      errorMessage: "Quota exceeded"
    });
  });

  it("replays a running run when pg-boss retries the same run id", async () => {
    runJobMock.mockResolvedValueOnce({
      nodeExecutions: [],
      nodeFeedback: [],
      toolInvocations: [],
      memoryWrites: [],
      finalOutput: { recovered: true },
      usageEvents: []
    } as never);

    const repository = new FakeWorkerPersistenceRepository(
      createRepositoryState({
        jobRuns: [
          {
            id: "run_stale",
            jobId: "job_1",
            status: "running",
            queuedAt: "2026-05-01T23:59:00.000Z",
            startedAt: "2026-05-01T23:59:00.000Z",
            claimedByWorkerId: "worker_old"
          }
        ]
      })
    );

    await processQueuedRun(repository, { runId: "run_stale" });

    expect(runJobMock).toHaveBeenCalledTimes(1);
    expect(repository.state.jobRuns[0]).toMatchObject({
      status: "succeeded",
      output: { recovered: true }
    });
  });

  it("hands off cleanly when run ownership is lost during partial failure telemetry persistence", async () => {
    const failedNodeExecution: NodeExecution = {
      id: "nodeexec_failed",
      jobRunId: "run_1",
      nodeId: "draftPlan",
      nodeVersion: "1.0.0",
      nodeType: "transform",
      status: "failed",
      resolvedInput: {},
      output: {
        data: {
          errorMessage: "draft failed"
        },
        artifacts: []
      },
      errorMessage: "draft failed",
      latencyMs: 0,
      tokenUsage: 0,
      retryCount: 0,
      startedAt: "2026-05-02T12:00:00.000Z",
      completedAt: "2026-05-02T12:00:00.000Z"
    };
    const failedNodeFeedback: NodeFeedback = {
      id: "feedback_failed",
      nodeExecutionId: failedNodeExecution.id,
      sourceNodeId: "validatePlan",
      targetNodeId: "draftPlan",
      score: 0,
      shouldRetry: true,
      summary: "Needs revision",
      createdAt: "2026-05-02T12:00:00.000Z"
    };

    runJobMock.mockRejectedValueOnce(
      new DAGExecutionError("draft failed", [failedNodeExecution], [failedNodeFeedback])
    );

    const repository = new FakeWorkerPersistenceRepository(
      createRepositoryState({
        loseOwnershipRuns: new Set(["run_1"])
      })
    );

    await expect(processQueuedRun(repository, { runId: "run_1" })).resolves.toBeUndefined();
    expect(repository.state.jobRuns[0]).toMatchObject({
      status: "running",
      claimedByWorkerId: "worker_other"
    });
    expect(repository.state.nodeFeedback).toEqual([]);
    expect(repository.state.usageEvents).toEqual([]);
  });

  it("ignores terminal runs when a duplicate queue delivery arrives later", async () => {
    const repository = new FakeWorkerPersistenceRepository(
      createRepositoryState({
        jobRuns: [
          {
            id: "run_done",
            jobId: "job_1",
            status: "succeeded",
            startedAt: "2026-05-02T00:00:00.000Z",
            completedAt: "2026-05-02T00:01:00.000Z",
            output: { ok: true }
          }
        ]
      })
    );

    await processQueuedRun(repository, { runId: "run_done" });

    expect(runJobMock).not.toHaveBeenCalled();
  });
});
