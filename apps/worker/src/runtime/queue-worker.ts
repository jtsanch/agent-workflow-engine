import { Pool } from "pg";
import { seedAgentDefinitions } from "@personal-agent-os/agent-sdk";
import type { Job, JsonObject, NodeExecution, ToolInvocation } from "@personal-agent-os/shared";
import { randomUUID } from "node:crypto";
import { runJob } from "./job-runner.js";
import { DAGExecutionError } from "./dag-engine.js";
import type { UsageTelemetry } from "./node-runner.js";

interface QueuedRunRow {
  run_id: string;
  job_id: string;
  user_id: string;
  job_name: string;
  dag_id: string;
  agent_definition_key: string | null;
  job_status: string;
  input: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface UsageStateRow {
  daily_used: number;
  daily_limit: number;
  monthly_used: number;
  monthly_limit: number;
  last_daily_reset: string;
  last_monthly_reset: string;
}

interface UsageState {
  dailyUsed: number;
  dailyLimit: number;
  monthlyUsed: number;
  monthlyLimit: number;
  lastDailyReset: string;
  lastMonthlyReset: string;
}

function toJsonObject(value: Record<string, unknown>): JsonObject {
  return value as JsonObject;
}

async function claimNextQueuedRun(pool: Pool): Promise<{ runId: string; job: Job } | null> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await client.query<QueuedRunRow>(
      `
        select
          jr.id as run_id,
          j.id as job_id,
          j.user_id,
          j.dag_id,
          j.agent_definition_key,
          j.name as job_name,
          j.status as job_status,
          j.inputs as input,
          j.created_at,
          j.updated_at
        from job_runs jr
        inner join jobs j on j.id = jr.job_id
        where jr.status = 'queued'
        order by jr.started_at asc
        limit 1
        for update skip locked
      `
    );

    const row = result.rows[0];

    if (!row) {
      await client.query("rollback");
      return null;
    }

    await client.query("update job_runs set status = 'running' where id = $1", [row.run_id]);
    await client.query("commit");

    return {
      runId: row.run_id,
      job: {
        id: row.job_id,
        userId: row.user_id,
        dagId: row.dag_id,
        agentDefinitionKey: row.agent_definition_key ?? undefined,
        name: row.job_name,
        status: row.job_status as Job["status"],
        inputs: toJsonObject(row.input),
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString()
      }
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function processNextQueuedRun(pool: Pool): Promise<boolean> {
  const claimed = await claimNextQueuedRun(pool);
  if (!claimed) {
    return false;
  }

  const {job, runId} = claimed;
  const agentDefinition = seedAgentDefinitions.find(
      (agent) => agent.dag.id === job.dagId || agent.key === job.agentDefinitionKey
  );
  if (!agentDefinition) {
    await pool.query("update job_runs set status = 'failed', error_message = $2, completed_at = now() where id = $1", [
      runId,
      `Unknown workflow definition for dag: ${job.dagId}`
    ]);
    return true;
  }

  // Initialize variables for job_runs update
  let jobStatus: 'succeeded' | 'failed' = 'succeeded';
  let completedAt: string = new Date().toISOString();
  let finalOutput: unknown = null;
  let errorMessage: string | null = null;
  let usageEventsToInsert: Array<UsageTelemetry & { id: string; userId: string; jobId: string; jobRunId: string }> = [];
  let totalTokensUsed = 0;

  try {
    const now = new Date().toISOString();
    const usageState = await resetUsageCountersIfNeeded(pool, job.userId, now);
    if (isQuotaExceeded(usageState)) {
      jobStatus = 'failed';
      errorMessage = "Quota exceeded";
      return true;
    }

    const executionResult = await runJob(job);
    completedAt = new Date().toISOString();
    const nodeExecutions = executionResult.nodeExecutions.map((nodeExecution) => ({
      ...nodeExecution,
      jobRunId: runId
    }));
    const toolInvocations = executionResult.toolInvocations;
    const memoryWrites = executionResult.memoryWrites;
    finalOutput = executionResult.finalOutput;
    const usageEvents = executionResult.usageEvents;

    await persistNodeExecutions(pool, nodeExecutions);

    for (const invocation of toolInvocations) {
      await insertToolInvocation(pool, {
        ...invocation,
        createdAt: invocation.createdAt ?? completedAt
      });
    }

    for (const memoryWrite of memoryWrites) {
      await pool.query(
        `
          insert into job_memories (id, job_id, key, value, updated_at)
          values ($1, $2, $3, $4::jsonb, $5)
          on conflict (job_id, key)
          do update set value = excluded.value, updated_at = excluded.updated_at
        `,
        [
          `memory_${Math.random().toString(36).slice(2, 10)}`,
          job.id,
          memoryWrite.key,
          JSON.stringify(
            memoryWrite.nodeId === undefined
              ? memoryWrite.value ?? null
              : {
                  value: memoryWrite.value ?? null,
                  nodeId: memoryWrite.nodeId
                }
          ),
          completedAt
        ]
      );
    }

    // Prepare usage events for consolidated insert in finally block
    usageEventsToInsert = usageEvents.map((usageEvent) => ({
      id: randomUUID(),
      userId: job.userId,
      jobId: job.id,
      jobRunId: runId,
      model: usageEvent.model,
      promptTokens: usageEvent.promptTokens,
      completionTokens: usageEvent.completionTokens,
      totalTokens: usageEvent.totalTokens,
      createdAt: usageEvent.createdAt
    }));

    totalTokensUsed = usageEvents.reduce((sum, usageEvent) => sum + usageEvent.totalTokens, 0);
    jobStatus = 'succeeded';
  } catch (error) {
    // Capture error values for job_runs update
    jobStatus = 'failed';
    errorMessage = error instanceof Error ? error.message : "Worker execution failed";
    console.error(`Error executing job run ${runId}:`, error);
    if (error instanceof DAGExecutionError) {
      await persistNodeExecutions(pool, error.nodeExecutions.map((nodeExecution) => ({
        ...nodeExecution,
        jobRunId: runId
      })));
    }
  } finally {
    // Transactional update: consolidate usage events insert and job_runs status update
    const client = await pool.connect();
    try {
      await client.query("begin");

      // Insert all usage events in a single query
      if (usageEventsToInsert.length > 0) {
        const values: unknown[] = [];
        const placeholders = usageEventsToInsert
          .map((event, index) => {
            const baseIndex = index * 9;
            values.push(
              event.id,
              event.userId,
              event.jobId,
              event.jobRunId,
              event.model,
              event.promptTokens,
              event.completionTokens,
              event.totalTokens,
              event.createdAt
            );
            return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9})`;
          })
          .join(", ");

        await client.query(
          `
            insert into usage_events (
              id, user_id, job_id, job_run_id, model, prompt_tokens, completion_tokens, total_tokens, created_at
            )
            values ${placeholders}
          `,
          values
        );

        // Update usage counters with total tokens
        await client.query(
          `
            update user_usage_counters
            set daily_tokens = daily_tokens + $2,
                monthly_tokens = monthly_tokens + $2
            where user_id = $1
          `,
          [job.userId, totalTokensUsed]
        );
      }

      // Update job_runs status based on success or failure
      if (jobStatus === 'succeeded') {
        await client.query(
          `
            update job_runs
            set status = 'succeeded',
                completed_at = $2,
                output = $3::jsonb,
                error_message = null
            where id = $1
          `,
          [runId, completedAt, JSON.stringify(finalOutput ?? null)]
        );
      } else {
        await client.query(
          "update job_runs set status = 'failed', completed_at = now(), error_message = $2 where id = $1",
          [runId, errorMessage]
        );
      }

      await client.query("commit");
    } catch (transactionError) {
      await client.query("rollback");
      console.error(`Error in job completion transaction for run ${runId}:`, transactionError);
    } finally {
      client.release();
    }
  }

  return true;
}

async function loadUsageState(pool: Pool, userId: string): Promise<UsageState> {
  const result = await pool.query<UsageStateRow>(
    `
      select
        c.daily_tokens as daily_used,
        l.daily_token_limit as daily_limit,
        c.monthly_tokens as monthly_used,
        l.monthly_token_limit as monthly_limit,
        c.last_daily_reset,
        c.last_monthly_reset
      from user_usage_counters c
      inner join user_llm_usage_limits l on l.user_id = c.user_id
      where c.user_id = $1
      limit 1
    `,
    [userId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Usage state not found");
  }

  return {
    dailyUsed: Number(row.daily_used),
    dailyLimit: Number(row.daily_limit),
    monthlyUsed: Number(row.monthly_used),
    monthlyLimit: Number(row.monthly_limit),
    lastDailyReset: new Date(row.last_daily_reset).toISOString(),
    lastMonthlyReset: new Date(row.last_monthly_reset).toISOString()
  };
}

function getResetUsageState(state: UsageState, now: string): UsageState {
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

async function resetUsageCountersIfNeeded(pool: Pool, userId: string, now: string): Promise<UsageState> {
  const state = await loadUsageState(pool, userId);
  const nextState = getResetUsageState(state, now);

  if (
    nextState.dailyUsed === state.dailyUsed &&
    nextState.monthlyUsed === state.monthlyUsed &&
    nextState.lastDailyReset === state.lastDailyReset &&
    nextState.lastMonthlyReset === state.lastMonthlyReset
  ) {
    return state;
  }

  await pool.query(
    `
      update user_usage_counters
      set daily_tokens = $2,
          monthly_tokens = $3,
          last_daily_reset = $4,
          last_monthly_reset = $5
      where user_id = $1
    `,
    [userId, nextState.dailyUsed, nextState.monthlyUsed, nextState.lastDailyReset, nextState.lastMonthlyReset]
  );

  return nextState;
}

function isQuotaExceeded(state: UsageState): boolean {
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


async function persistNodeExecutions(pool: Pool, nodeExecutions: NodeExecution[]): Promise<void> {
  for (const nodeExecution of nodeExecutions) {
    await insertNodeExecution(pool, nodeExecution);
  }
}

async function insertNodeExecution(pool: Pool, nodeExecution: NodeExecution): Promise<void> {
  await pool.query(
    `
      insert into node_executions (
        id, job_run_id, node_id, node_type, node_version, status, input, resolved_input, output, error_message, latency_ms, token_usage, cost_usd, retry_count, started_at, completed_at
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14, $15, $16)
    `,
    [
      nodeExecution.id,
      nodeExecution.jobRunId,
      nodeExecution.nodeId,
      nodeExecution.nodeType,
      nodeExecution.nodeVersion,
      nodeExecution.status,
      JSON.stringify(nodeExecution.input ?? nodeExecution.resolvedInput),
      JSON.stringify(nodeExecution.resolvedInput),
      JSON.stringify(nodeExecution.output ?? null),
      nodeExecution.errorMessage ?? null,
      nodeExecution.latencyMs,
      nodeExecution.tokenUsage,
      nodeExecution.costUsd ?? null,
      nodeExecution.retryCount,
      nodeExecution.startedAt,
      nodeExecution.completedAt ?? null
    ]
  );
}

async function insertToolInvocation(pool: Pool, invocation: ToolInvocation): Promise<void> {
  await pool.query(
    `
      insert into tool_invocations (id, node_execution_id, tool_name, request, response, status, created_at)
      values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
    `,
    [
      invocation.id,
      invocation.nodeExecutionId,
      invocation.toolName,
      JSON.stringify(invocation.request),
      JSON.stringify(invocation.response ?? null),
      invocation.status,
      invocation.createdAt
    ]
  );
}


export const __test__ = {
  getResetUsageState,
  isQuotaExceeded
};
