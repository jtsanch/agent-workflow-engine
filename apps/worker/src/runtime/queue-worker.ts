import { seedAgentDefinitions } from "@personal-agent-os/agent-sdk";
import { DAGExecutionError } from "./dag-engine.js";
import { runJob } from "./job-runner.js";
import type { UsageStateRecord, WorkerPersistenceRepository } from "../repositories/interfaces.js";

export async function processNextQueuedRun(persistence: WorkerPersistenceRepository): Promise<boolean> {
  const claimed = await persistence.claimNextQueuedRun();
  if (!claimed) {
    return false;
  }

  const { job, runId } = claimed;
  const agentDefinition = seedAgentDefinitions.find(
    (agent) => agent.dag.id === job.dagId || agent.key === job.agentDefinitionKey
  );
  if (!agentDefinition) {
    await persistence.failRun(runId, `Unknown workflow definition for dag: ${job.dagId}`);
    return true;
  }

  let jobStatus: "succeeded" | "failed" = "succeeded";
  let completedAt = new Date().toISOString();
  let finalOutput: unknown = null;
  let errorMessage: string | null = null;
  let usageEvents: Awaited<ReturnType<typeof runJob>>["usageEvents"] = [];

  try {
    const now = new Date().toISOString();
    const usageState = await resetUsageCountersIfNeeded(persistence, job.userId, now);
    if (isQuotaExceeded(usageState)) {
      jobStatus = "failed";
      errorMessage = "Quota exceeded";
      return true;
    }

    const executionResult = await runJob(job);
    completedAt = new Date().toISOString();
    finalOutput = executionResult.finalOutput;
    usageEvents = executionResult.usageEvents;

    await persistence.persistNodeExecutions(
      executionResult.nodeExecutions.map((nodeExecution) => ({
        ...nodeExecution,
        jobRunId: runId
      }))
    );
    await persistence.persistToolInvocations(executionResult.toolInvocations, completedAt);
    await persistence.upsertJobMemories(job.id, executionResult.memoryWrites, completedAt);
  } catch (error) {
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
      console.error(`Error in job completion transaction for run ${runId}:`, transactionError);
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
