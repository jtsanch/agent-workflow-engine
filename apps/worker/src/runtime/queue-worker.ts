import { createLogger } from "@personal-agent-os/observability";
import { seedAgentDefinitions } from "@personal-agent-os/agent-sdk";
import type { RunExecutionJobData } from "../run-queue.js";
import { DAGExecutionError } from "./dag-engine.js";
import { runJob } from "./job-runner.js";
import {
  RunOwnershipLostError,
  type UsageStateRecord,
  type WorkerPersistenceRepository
} from "../repositories/interfaces.js";

const logger = createLogger("worker.queue");

export async function processQueuedRun(
  persistence: WorkerPersistenceRepository,
  payload: RunExecutionJobData
): Promise<void> {
  const claimed = await persistence.prepareRunForExecution(payload.runId);
  if (!claimed) {
    return;
  }

  const { job, runId } = claimed;
  const agentDefinition = seedAgentDefinitions.find(
    (agent) => agent.dag.id === job.dagId || agent.key === job.agentDefinitionKey
  );

  if (!agentDefinition) {
    await failClaimedRun(persistence, runId, `Unknown workflow definition for dag: ${job.dagId}`);
    return;
  }

  try {
    const now = new Date().toISOString();
    const usageState = await resetUsageCountersIfNeeded(persistence, job.userId, now);
    if (isQuotaExceeded(usageState)) {
      await failClaimedRun(persistence, runId, "Quota exceeded");
      return;
    }

    const executionResult = await runJob(job);
    await persistence.persistNodeExecutions(
      executionResult.nodeExecutions.map((nodeExecution) => ({
        ...nodeExecution,
        jobRunId: runId
      }))
    );

    const completedAt = new Date().toISOString();
    await persistence.persistNodeFeedback(runId, executionResult.nodeFeedback);
    await persistence.persistToolInvocations(runId, executionResult.toolInvocations, completedAt);
    await persistence.upsertJobMemories(runId, job.id, executionResult.memoryWrites, completedAt);
    await persistence.finalizeRun({
      runId,
      userId: job.userId,
      jobId: job.id,
      jobStatus: "succeeded",
      completedAt,
      finalOutput: executionResult.finalOutput,
      errorMessage: null,
      usageEvents: executionResult.usageEvents
    });
  } catch (error) {
    if (error instanceof RunOwnershipLostError) {
      logger.warn("Stopping run cleanup because run ownership was lost", { runId });
      return;
    }

    if (error instanceof DAGExecutionError) {
      await persistFailureArtifacts(persistence, runId, error);
      await failClaimedRun(persistence, runId, error.message);
      return;
    }

    if (isExecutionFailure(error)) {
      await failClaimedRun(
        persistence,
        runId,
        error instanceof Error ? error.message : "Worker execution failed"
      );
      return;
    }

    throw error;
  }
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
  isQuotaExceeded,
  isExecutionFailure
};

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

async function persistFailureArtifacts(
  persistence: WorkerPersistenceRepository,
  runId: string,
  error: DAGExecutionError
): Promise<void> {
  try {
    await persistence.persistNodeExecutions(
      error.nodeExecutions.map((nodeExecution) => ({
        ...nodeExecution,
        jobRunId: runId
      }))
    );
    await persistence.persistNodeFeedback(runId, error.nodeFeedback);
  } catch (persistenceError) {
    if (persistenceError instanceof RunOwnershipLostError) {
      logger.warn("Stopping partial failure telemetry persistence because run ownership was lost", { runId });
      return;
    }

    throw persistenceError;
  }
}

function isExecutionFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return !/^(connect|Connection|ECONN|ETIMEDOUT|timeout|terminating connection|remaining connection slots)/i.test(
    error.message
  );
}
