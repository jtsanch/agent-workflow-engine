import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Job, JsonObject, NodeExecution, ToolInvocation } from "@personal-agent-os/shared";
import { pquery } from "./pquery.js";
import type {
  ClaimedRunRecord,
  FinalizeRunRecord,
  JobMemoryWriteRecord,
  UsageStateRecord,
  WorkerPersistenceRepository
} from "../interfaces.js";

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

function toJsonObject(value: Record<string, unknown>): JsonObject {
  return value as JsonObject;
}

export class PostgresWorkerPersistenceRepository implements WorkerPersistenceRepository {
  constructor(private readonly pool: Pool) {}

  async claimNextQueuedRun(): Promise<ClaimedRunRecord | null> {
    const client = await this.pool.connect();
    try {
      await pquery(client, "begin");
      const result = await pquery<QueuedRunRow>(
        client,
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
        await pquery(client, "rollback");
        return null;
      }

      await pquery(client, "update job_runs set status = 'running' where id = $1", [row.run_id]);
      await pquery(client, "commit");

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
      await pquery(client, "rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async failRun(runId: string, errorMessage: string, completedAt?: string): Promise<void> {
    if (completedAt) {
      await pquery(
        this.pool,
        "update job_runs set status = 'failed', completed_at = $2, error_message = $3 where id = $1",
        [runId, completedAt, errorMessage]
      );
      return;
    }

    await pquery(
      this.pool,
      "update job_runs set status = 'failed', error_message = $2, completed_at = now() where id = $1",
      [runId, errorMessage]
    );
  }

  async loadUsageState(userId: string): Promise<UsageStateRecord> {
    const result = await pquery<UsageStateRow>(
      this.pool,
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

  async updateUsageState(userId: string, state: UsageStateRecord): Promise<void> {
    await pquery(
      this.pool,
      `
        update user_usage_counters
        set daily_tokens = $2,
            monthly_tokens = $3,
            last_daily_reset = $4,
            last_monthly_reset = $5
        where user_id = $1
      `,
      [userId, state.dailyUsed, state.monthlyUsed, state.lastDailyReset, state.lastMonthlyReset]
    );
  }

  async persistNodeExecutions(nodeExecutions: NodeExecution[]): Promise<void> {
    for (const nodeExecution of nodeExecutions) {
      await pquery(
        this.pool,
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
  }

  async persistToolInvocations(toolInvocations: ToolInvocation[], defaultCreatedAt: string): Promise<void> {
    for (const invocation of toolInvocations) {
      await pquery(
        this.pool,
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
          invocation.createdAt ?? defaultCreatedAt
        ]
      );
    }
  }

  async upsertJobMemories(jobId: string, memoryWrites: JobMemoryWriteRecord[], updatedAt: string): Promise<void> {
    for (const memoryWrite of memoryWrites) {
      await pquery(
        this.pool,
        `
          insert into job_memories (id, job_id, key, value, updated_at)
          values ($1, $2, $3, $4::jsonb, $5)
          on conflict (job_id, key)
          do update set value = excluded.value, updated_at = excluded.updated_at
        `,
        [
          `memory_${Math.random().toString(36).slice(2, 10)}`,
          jobId,
          memoryWrite.key,
          JSON.stringify(
            memoryWrite.nodeId === undefined
              ? memoryWrite.value ?? null
              : {
                  value: memoryWrite.value ?? null,
                  nodeId: memoryWrite.nodeId
                }
          ),
          updatedAt
        ]
      );
    }
  }

  async finalizeRun(record: FinalizeRunRecord): Promise<void> {
    const usageEventsToInsert = record.usageEvents.map((usageEvent) => ({
      id: randomUUID(),
      userId: record.userId,
      jobId: record.jobId,
      jobRunId: record.runId,
      model: usageEvent.model,
      promptTokens: usageEvent.promptTokens,
      completionTokens: usageEvent.completionTokens,
      totalTokens: usageEvent.totalTokens,
      createdAt: usageEvent.createdAt
    }));

    const totalTokensUsed = record.usageEvents.reduce((sum, usageEvent) => sum + usageEvent.totalTokens, 0);
    const client = await this.pool.connect();

    try {
      await pquery(client, "begin");

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

        await pquery(
          client,
          `
            insert into usage_events (
              id, user_id, job_id, job_run_id, model, prompt_tokens, completion_tokens, total_tokens, created_at
            )
            values ${placeholders}
          `,
          values
        );

        await pquery(
          client,
          `
            update user_usage_counters
            set daily_tokens = daily_tokens + $2,
                monthly_tokens = monthly_tokens + $2
            where user_id = $1
          `,
          [record.userId, totalTokensUsed]
        );
      }

      if (record.jobStatus === "succeeded") {
        await pquery(
          client,
          `
            update job_runs
            set status = 'succeeded',
                completed_at = $2,
                output = $3::jsonb,
                error_message = null
            where id = $1
          `,
          [record.runId, record.completedAt, JSON.stringify(record.finalOutput ?? null)]
        );
      } else {
        await pquery(
          client,
          "update job_runs set status = 'failed', completed_at = $2, error_message = $3 where id = $1",
          [record.runId, record.completedAt, record.errorMessage]
        );
      }

      await pquery(client, "commit");
    } catch (error) {
      await pquery(client, "rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
