import { Pool } from "pg";
import { seedAgentDefinitions } from "../../../../packages/agent-sdk/src/definitions.js";
import type { Job, JsonObject, NodeExecution, ToolInvocation } from "@personal-agent-os/shared";
import { runJob } from "./job-runner.js";
import { DAGExecutionError } from "./dag-engine.js";

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
          coalesce(j.inputs, j.input) as input,
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

  try {
    const executionResult = await runJob(job);
    const completedAt = new Date().toISOString();
    const nodeExecutions = executionResult.nodeExecutions.map((nodeExecution) => ({
      ...nodeExecution,
      jobRunId: runId
    }));
    const toolInvocations = executionResult.toolInvocations;
    const memoryWrites = executionResult.memoryWrites;
    const finalOutput = executionResult.finalOutput;

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

    await pool.query(
        `
          update job_runs
          set status = 'succeeded',
              completed_at = $2,
              output = $3::jsonb, error_message = null
          where id = $1
        `,
        [runId, completedAt, JSON.stringify(finalOutput ?? null)]
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker execution failed";
    console.error(`Error executing job run ${runId}:`, error);
    if (error instanceof DAGExecutionError) {
      await persistNodeExecutions(pool, error.nodeExecutions.map((nodeExecution) => ({
        ...nodeExecution,
        jobRunId: runId
      })));
    }

    await pool.query("update job_runs set status = 'failed', completed_at = now(), error_message = $2 where id = $1", [
      runId,
      message
    ]);
  }

  return true;
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
