import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

vi.mock("../../../src/runtime/job-runner.js", () => ({
  runJob: vi.fn()
}));

import { processNextQueuedRun } from "../../../src/runtime/queue-worker.js";
import { runJob } from "../../../src/runtime/job-runner.js";

const runJobMock = vi.mocked(runJob);

type FakeJobRun = {
  id: string;
  jobId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  startedAt: string;
  completedAt?: string;
  errorMessage?: string | null;
  output?: unknown;
};

type FakeJob = {
  id: string;
  userId: string;
  dagId: string;
  agentDefinitionKey: string | null;
  name: string;
  status: string;
  inputs: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

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
  id: string;
  userId: string;
  jobId: string;
  jobRunId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  createdAt: string;
};

class FakePool {
  readonly state: {
    jobRuns: FakeJobRun[];
    jobs: FakeJob[];
    usageCounters: Map<string, FakeUsageCounters>;
    usageLimits: Map<string, FakeUsageLimits>;
    usageEvents: FakeUsageEvent[];
  };

  constructor(state: FakePool["state"]) {
    this.state = state;
  }

  async connect() {
    return {
      query: this.query.bind(this),
      release() {
        return;
      }
    };
  }

  async query(sql: string, params: unknown[] = []) {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized === "begin" || normalized === "commit" || normalized === "rollback") {
      return { rows: [] };
    }

    if (normalized.includes("from job_runs jr inner join jobs j")) {
      const queuedRun = this.state.jobRuns
        .filter((run) => run.status === "queued")
        .sort((left, right) => left.startedAt.localeCompare(right.startedAt))[0];

      if (!queuedRun) {
        return { rows: [] };
      }

      const job = this.state.jobs.find((candidate) => candidate.id === queuedRun.jobId);
      if (!job) {
        return { rows: [] };
      }

      return {
        rows: [
          {
            run_id: queuedRun.id,
            job_id: job.id,
            user_id: job.userId,
            dag_id: job.dagId,
            agent_definition_key: job.agentDefinitionKey,
            job_name: job.name,
            job_status: job.status,
            input: job.inputs,
            created_at: job.createdAt,
            updated_at: job.updatedAt
          }
        ]
      };
    }

    if (normalized.startsWith("update job_runs set status = 'running'")) {
      const run = this.state.jobRuns.find((candidate) => candidate.id === params[0]);
      if (run) {
        run.status = "running";
      }
      return { rows: [] };
    }

    if (normalized.includes("select c.daily_tokens as daily_used")) {
      const userId = String(params[0]);
      const counters = this.state.usageCounters.get(userId);
      const limits = this.state.usageLimits.get(userId);

      if (!counters || !limits) {
        return { rows: [] };
      }

      return {
        rows: [
          {
            daily_used: counters.dailyTokens,
            daily_limit: limits.dailyTokenLimit,
            monthly_used: counters.monthlyTokens,
            monthly_limit: limits.monthlyTokenLimit,
            last_daily_reset: counters.lastDailyReset,
            last_monthly_reset: counters.lastMonthlyReset
          }
        ]
      };
    }

    if (normalized.startsWith("update user_usage_counters set daily_tokens = $2, monthly_tokens = $3")) {
      const counters = this.state.usageCounters.get(String(params[0]));
      if (counters) {
        counters.dailyTokens = Number(params[1]);
        counters.monthlyTokens = Number(params[2]);
        counters.lastDailyReset = String(params[3]);
        counters.lastMonthlyReset = String(params[4]);
      }
      return { rows: [] };
    }

    if (normalized.startsWith("update user_usage_counters set daily_tokens = daily_tokens + $2")) {
      const counters = this.state.usageCounters.get(String(params[0]));
      if (counters) {
        counters.dailyTokens += Number(params[1]);
        counters.monthlyTokens += Number(params[1]);
      }
      return { rows: [] };
    }

    if (normalized.startsWith("insert into usage_events")) {
      this.state.usageEvents.push({
        id: String(params[0]),
        userId: String(params[1]),
        jobId: String(params[2]),
        jobRunId: String(params[3]),
        model: String(params[4]),
        promptTokens: Number(params[5]),
        completionTokens: Number(params[6]),
        totalTokens: Number(params[7]),
        createdAt: String(params[8])
      });
      return { rows: [] };
    }

    if (normalized.startsWith("insert into node_executions")) {
      return { rows: [] };
    }

    if (normalized.startsWith("insert into tool_invocations")) {
      return { rows: [] };
    }

    if (normalized.startsWith("insert into job_memories")) {
      return { rows: [] };
    }

    if (normalized.startsWith("update job_runs set status = 'succeeded'")) {
      const run = this.state.jobRuns.find((candidate) => candidate.id === params[0]);
      if (run) {
        run.status = "succeeded";
        run.completedAt = String(params[1]);
        run.output = JSON.parse(String(params[2]));
        run.errorMessage = null;
      }
      return { rows: [] };
    }

    if (normalized.startsWith("update job_runs set status = 'failed'")) {
      const run = this.state.jobRuns.find((candidate) => candidate.id === params[0]);
      if (run) {
        run.status = "failed";
        run.errorMessage = String(params[1]);
        run.completedAt = new Date().toISOString();
      }
      return { rows: [] };
    }

    throw new Error(`Unhandled SQL in fake pool: ${normalized}`);
  }
}

function createPoolState(overrides?: Partial<FakePool["state"]>): FakePool["state"] {
  return {
    jobRuns: [
      {
        id: "run_1",
        jobId: "job_1",
        status: "queued",
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
    const state = createPoolState({
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
    });
    const pool = new FakePool(state) as unknown as Pool;

    const didWork = await processNextQueuedRun(pool);

    expect(didWork).toBe(true);
    expect(runJobMock).not.toHaveBeenCalled();
    expect(state.jobRuns[0]).toMatchObject({
      status: "failed",
      errorMessage: "Quota exceeded"
    });
    expect(state.usageEvents).toEqual([]);
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

    const state = createPoolState({
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
    });
    const pool = new FakePool(state) as unknown as Pool;

    const didWork = await processNextQueuedRun(pool);

    expect(didWork).toBe(true);
    expect(state.jobRuns[0]?.status).toBe("succeeded");
    expect(state.usageEvents).toHaveLength(1);
    expect(state.usageEvents[0]).toMatchObject({
      userId: "user_1",
      jobId: "job_1",
      jobRunId: "run_1",
      model: "gpt-4.1",
      promptTokens: 100,
      completionTokens: 40,
      totalTokens: 140
    });
    expect(state.usageCounters.get("user_1")).toMatchObject({
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

    const state = createPoolState({
      jobRuns: [
        {
          id: "run_1",
          jobId: "job_1",
          status: "queued",
          startedAt: "2026-05-02T00:00:00.000Z"
        },
        {
          id: "run_2",
          jobId: "job_1",
          status: "queued",
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
    });
    const pool = new FakePool(state) as unknown as Pool;

    expect(await processNextQueuedRun(pool)).toBe(true);
    expect(await processNextQueuedRun(pool)).toBe(true);

    expect(runJobMock).toHaveBeenCalledTimes(1);
    expect(state.jobRuns[0]).toMatchObject({ status: "succeeded" });
    expect(state.jobRuns[1]).toMatchObject({
      status: "failed",
      errorMessage: "Quota exceeded"
    });
  });
});
