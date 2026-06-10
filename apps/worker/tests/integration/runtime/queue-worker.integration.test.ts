import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/runtime/job-runner.js", () => ({
  runJob: vi.fn()
}));

import { processNextQueuedRun } from "../../../src/runtime/queue-worker.js";
import { runJob } from "../../../src/runtime/job-runner.js";
import type {
  ClaimedRunRecord,
  FinalizeRunRecord,
  RunOwnershipLostError,
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
  leaseExpiresAt?: string;
  lastHeartbeatAt?: string;
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
  private readonly leaseDurationMs = 30000;

  readonly state: {
    jobRuns: FakeJobRun[];
    jobs: FakeJob[];
    usageCounters: Map<string, FakeUsageCounters>;
    usageLimits: Map<string, FakeUsageLimits>;
    usageEvents: FakeUsageEvent[];
    loseOwnershipOnRenewRuns: Set<string>;
  };

  constructor(state: FakeWorkerPersistenceRepository["state"]) {
    this.state = state;
  }

  async claimNextQueuedRun(): Promise<ClaimedRunRecord | null> {
    const now = new Date().toISOString();
    const queuedRun = this.state.jobRuns
      .filter((run) => {
        if (run.status === "queued") {
          return true;
        }

        return run.status === "running" && typeof run.leaseExpiresAt === "string" && run.leaseExpiresAt <= now;
      })
      .sort((left, right) => (left.queuedAt ?? left.startedAt).localeCompare(right.queuedAt ?? right.startedAt))[0];

    if (!queuedRun) {
      return null;
    }

    const job = this.state.jobs.find((candidate) => candidate.id === queuedRun.jobId);
    if (!job) {
      return null;
    }

    queuedRun.status = "running";
    queuedRun.claimedAt = now;
    queuedRun.lastHeartbeatAt = now;
    queuedRun.leaseExpiresAt = new Date(Date.now() + this.leaseDurationMs).toISOString();
    queuedRun.claimedByWorkerId = this.workerId;
    return {
      runId: queuedRun.id,
      job
    };
  }

  async renewRunLease(runId: string): Promise<void> {
    const run = this.state.jobRuns.find((candidate) => candidate.id === runId);
    if (!run || run.status !== "running" || run.claimedByWorkerId !== this.workerId) {
      throw new LostOwnershipError(runId);
    }

    if (this.state.loseOwnershipOnRenewRuns.has(runId)) {
      run.claimedByWorkerId = "worker_other";
      throw new LostOwnershipError(runId);
    }

    run.lastHeartbeatAt = new Date().toISOString();
    run.leaseExpiresAt = new Date(Date.now() + this.leaseDurationMs).toISOString();
  }

  async failRun(runId: string, errorMessage: string, completedAt?: string): Promise<void> {
    const run = this.state.jobRuns.find((candidate) => candidate.id === runId);
    if (!run || run.status !== "running" || run.claimedByWorkerId !== this.workerId) {
      throw new LostOwnershipError(runId);
    }

    run.status = "failed";
    run.errorMessage = errorMessage;
    run.completedAt = completedAt ?? new Date().toISOString();
    run.leaseExpiresAt = undefined;
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

  async persistNodeExecutions(): Promise<void> {
    return;
  }

  async persistToolInvocations(): Promise<void> {
    return;
  }

  async upsertJobMemories(): Promise<void> {
    return;
  }

  async finalizeRun(record: FinalizeRunRecord): Promise<void> {
    const run = this.state.jobRuns.find((candidate) => candidate.id === record.runId);
    if (!run || run.status !== "running" || run.claimedByWorkerId !== this.workerId) {
      throw new LostOwnershipError(record.runId);
    }

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
    run.leaseExpiresAt = undefined;

    if (record.jobStatus === "succeeded") {
      run.output = record.finalOutput;
      run.errorMessage = null;
    } else {
      run.errorMessage = record.errorMessage;
    }
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
    loseOwnershipOnRenewRuns: new Set<string>(),
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

    const didWork = await processNextQueuedRun(repository);

    expect(didWork).toBe(true);
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

    const didWork = await processNextQueuedRun(repository);

    expect(didWork).toBe(true);
    expect(repository.state.jobRuns[0]?.status).toBe("succeeded");
    expect(repository.state.usageEvents).toHaveLength(1);
    expect(repository.state.usageEvents[0]).toMatchObject({
      userId: "user_1",
      jobId: "job_1",
      jobRunId: "run_1",
      model: "gpt-4.1",
      promptTokens: 100,
      completionTokens: 40,
      totalTokens: 140
    });
    expect(repository.state.usageCounters.get("user_1")).toMatchObject({
      dailyTokens: 240,
      monthlyTokens: 340
    });
  });

  it("handles back-to-back executions with best-effort quota enforcement", async () => {
    runJobMock.mockResolvedValueOnce({
      nodeExecutions: [],
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

    expect(await processNextQueuedRun(repository)).toBe(true);
    expect(await processNextQueuedRun(repository)).toBe(true);

    expect(runJobMock).toHaveBeenCalledTimes(1);
    expect(repository.state.jobRuns[0]).toMatchObject({ status: "succeeded" });
    expect(repository.state.jobRuns[1]).toMatchObject({
      status: "failed",
      errorMessage: "Quota exceeded"
    });
  });

  it("reclaims expired running runs whose lease has lapsed", async () => {
    runJobMock.mockResolvedValueOnce({
      nodeExecutions: [],
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
            leaseExpiresAt: "2026-05-02T11:59:59.000Z",
            claimedByWorkerId: "worker_old"
          }
        ]
      })
    );

    const didWork = await processNextQueuedRun(repository);

    expect(didWork).toBe(true);
    expect(runJobMock).toHaveBeenCalledTimes(1);
    expect(repository.state.jobRuns[0]).toMatchObject({
      status: "succeeded",
      claimedByWorkerId: "worker_test",
      output: { recovered: true }
    });
  });

  it("skips finalization after lease ownership is lost during execution", async () => {
    runJobMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              nodeExecutions: [],
              toolInvocations: [],
              memoryWrites: [],
              finalOutput: { ok: true },
              usageEvents: []
            } as never);
          }, 20);
        })
    );

    const repository = new FakeWorkerPersistenceRepository(
      createRepositoryState({
        loseOwnershipOnRenewRuns: new Set(["run_1"])
      })
    );

    const processing = processNextQueuedRun(repository, { heartbeatIntervalMs: 5 });
    await vi.advanceTimersByTimeAsync(25);

    await expect(processing).resolves.toBe(true);
    expect(repository.state.jobRuns[0]).toMatchObject({
      status: "running",
      claimedByWorkerId: "worker_other"
    });
    expect(repository.state.usageEvents).toEqual([]);
  });
});
