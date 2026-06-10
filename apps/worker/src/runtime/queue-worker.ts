import { createLogger } from "@personal-agent-os/observability";
import { seedAgentDefinitions } from "@personal-agent-os/agent-sdk";
import { DAGExecutionError } from "./dag-engine.js";
import { runJob } from "./job-runner.js";
import {
  RunOwnershipLostError,
  type UsageStateRecord,
  type WorkerPersistenceRepository
} from "../repositories/interfaces.js";

const logger = createLogger("worker.queue");

export type ProcessNextQueuedRunOptions = {
  heartbeatIntervalMs?: number;
};

type LeaseHeartbeatController = {
  assertOwned(): void;
  stop(): Promise<void>;
};

export async function processNextQueuedRun(
  persistence: WorkerPersistenceRepository,
  options: ProcessNextQueuedRunOptions = {}
): Promise<boolean> {
  const claimed = await persistence.claimNextQueuedRun();
  if (!claimed) {
    return false;
  }

  const { job, runId } = claimed;
  const heartbeat = startLeaseHeartbeat(persistence, runId, options.heartbeatIntervalMs ?? 10000);
  const agentDefinition = seedAgentDefinitions.find(
    (agent) => agent.dag.id === job.dagId || agent.key === job.agentDefinitionKey
  );
  if (!agentDefinition) {
    await failClaimedRun(persistence, runId, `Unknown workflow definition for dag: ${job.dagId}`);
    await stopHeartbeat(heartbeat, runId);
    return true;
  }

  let jobStatus: "succeeded" | "failed" = "succeeded";
  let completedAt = new Date().toISOString();
  let finalOutput: unknown = null;
  let errorMessage: string | null = null;
  let usageEvents: Awaited<ReturnType<typeof runJob>>["usageEvents"] = [];
  let shouldFinalize = true;

  try {
    const now = new Date().toISOString();
    const usageState = await resetUsageCountersIfNeeded(persistence, job.userId, now);
    heartbeat.assertOwned();
    if (isQuotaExceeded(usageState)) {
      jobStatus = "failed";
      errorMessage = "Quota exceeded";
      return true;
    }

    const executionResult = await runJob(job);
    heartbeat.assertOwned();
    completedAt = new Date().toISOString();
    finalOutput = executionResult.finalOutput;
    usageEvents = executionResult.usageEvents;

    await persistence.persistNodeExecutions(
      executionResult.nodeExecutions.map((nodeExecution) => ({
        ...nodeExecution,
        jobRunId: runId
      }))
    );
    heartbeat.assertOwned();
    await persistence.persistToolInvocations(executionResult.toolInvocations, completedAt);
    heartbeat.assertOwned();
    await persistence.upsertJobMemories(job.id, executionResult.memoryWrites, completedAt);
  } catch (error) {
    if (error instanceof RunOwnershipLostError) {
      shouldFinalize = false;
      logger.warn("Skipping finalization because run ownership was lost", { runId });
      return true;
    }

    jobStatus = "failed";
    errorMessage = error instanceof Error ? error.message : "Worker execution failed";
    console.error(`Error executing job run ${runId}:`, error);

    if (error instanceof DAGExecutionError) {
      await persistence.persistNodeExecutions(
        error.nodeExecutions.map((nodeExecution) => ({
          ...nodeExecution,
          jobRunId: runId
        }))
      );
    }
  } finally {
    if (!(await stopHeartbeat(heartbeat, runId))) {
      shouldFinalize = false;
    }

    if (shouldFinalize) {
      try {
        await persistence.finalizeRun({
          runId,
          userId: job.userId,
          jobId: job.id,
          jobStatus,
          completedAt,
          finalOutput,
          errorMessage,
          usageEvents
        });
      } catch (transactionError) {
        if (transactionError instanceof RunOwnershipLostError) {
          logger.warn("Skipping finalization because run ownership was lost", { runId });
        } else {
          console.error(`Error in job completion transaction for run ${runId}:`, transactionError);
        }
      }
    }
  }

  return true;
}

async function resetUsageCountersIfNeeded(
  persistence: WorkerPersistenceRepository,
  userId: string,
  now: string
): Promise<UsageStateRecord> {
  const state = await persistence.loadUsageState(userId);
  const nextState = getResetUsageState(state, now);

  if (
    nextState.dailyUsed === state.dailyUsed &&
    nextState.monthlyUsed === state.monthlyUsed &&
    nextState.lastDailyReset === state.lastDailyReset &&
    nextState.lastMonthlyReset === state.lastMonthlyReset
  ) {
    return state;
  }

  await persistence.updateUsageState(userId, nextState);
  return nextState;
}

function getResetUsageState(state: UsageStateRecord, now: string): UsageStateRecord {
  const nowDate = new Date(now);
  const lastDailyReset = new Date(state.lastDailyReset);
  const lastMonthlyReset = new Date(state.lastMonthlyReset);

  return {
    ...state,
    dailyUsed: isSameUtcDay(lastDailyReset, nowDate) ? state.dailyUsed : 0,
    monthlyUsed: isSameUtcMonth(lastMonthlyReset, nowDate) ? state.monthlyUsed : 0,
    lastDailyReset: isSameUtcDay(lastDailyReset, nowDate) ? state.lastDailyReset : now,
    lastMonthlyReset: isSameUtcMonth(lastMonthlyReset, nowDate) ? state.lastMonthlyReset : now
  };
}

function isQuotaExceeded(state: UsageStateRecord): boolean {
  return state.dailyUsed >= state.dailyLimit || state.monthlyUsed >= state.monthlyLimit;
}

function isSameUtcDay(left: Date, right: Date): boolean {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}

function isSameUtcMonth(left: Date, right: Date): boolean {
  return left.getUTCFullYear() === right.getUTCFullYear() && left.getUTCMonth() === right.getUTCMonth();
}

export const __test__ = {
  getResetUsageState,
  isQuotaExceeded
};

function startLeaseHeartbeat(
  persistence: WorkerPersistenceRepository,
  runId: string,
  heartbeatIntervalMs: number
): LeaseHeartbeatController {
  let inFlight: Promise<void> | null = null;
  let stopped = false;
  let heartbeatError: Error | null = null;

  const renew = async () => {
    try {
      await persistence.renewRunLease(runId);
    } catch (error) {
      if (error instanceof RunOwnershipLostError) {
        heartbeatError = error;
        return;
      }

      heartbeatError = error instanceof Error ? error : new Error(String(error));
    }
  };

  const timer = setInterval(() => {
    if (stopped || heartbeatError || inFlight) {
      return;
    }

    inFlight = renew().finally(() => {
      inFlight = null;
    });
  }, heartbeatIntervalMs);

  return {
    assertOwned() {
      if (heartbeatError) {
        throw heartbeatError;
      }
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      if (inFlight) {
        await inFlight;
      }
      if (heartbeatError) {
        throw heartbeatError;
      }
    }
  };
}

async function failClaimedRun(
  persistence: WorkerPersistenceRepository,
  runId: string,
  errorMessage: string
): Promise<void> {
  try {
    await persistence.failRun(runId, errorMessage);
  } catch (error) {
    if (error instanceof RunOwnershipLostError) {
      logger.warn("Skipping failure finalization because run ownership was lost", { runId });
      return;
    }

    throw error;
  }
}

async function stopHeartbeat(heartbeat: LeaseHeartbeatController, runId: string): Promise<boolean> {
  try {
    await heartbeat.stop();
    return true;
  } catch (error) {
    if (error instanceof RunOwnershipLostError) {
      logger.warn("Stopping work because run ownership was lost", { runId });
      return false;
    }

    throw error;
  }
}
