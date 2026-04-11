import { Pool } from "pg";
import { seedAgentDefinitions } from "@personal-agent-os/agent-sdk";
import type { Job, JobRunStep, NodeExecution, NodeFeedback, ToolInvocation } from "@personal-agent-os/shared";
import { runJob } from "./job-runner.js";

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
    console.log(JSON.stringify(row));
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
        inputs: row.input,
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

  const { job, runId } = claimed;
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
    const execution = await runJob(job);
    const memory = execution.memory;

    const completedAt = new Date().toISOString();
    const legacySteps = Array.isArray((execution.result as { steps?: Array<{ name: string; detail: Record<string, unknown> }> }).steps)
      ? (execution.result as { steps: Array<{ name: string; detail: Record<string, unknown> }> }).steps
      : execution.nodeExecutions.map((nodeExecution) => ({
          name: nodeExecution.nodeId,
          detail: nodeExecution.output ?? {}
        }));

    const steps: JobRunStep[] = legacySteps.map((step) => ({
      id: `step_${Math.random().toString(36).slice(2, 10)}`,
      jobRunId: runId,
      name: step.name,
      status: "succeeded",
      startedAt: completedAt,
      completedAt,
      detail: step.detail
    }));

    const invocations: ToolInvocation[] = steps.map((step) => ({
      id: `tool_${Math.random().toString(36).slice(2, 10)}`,
      jobRunStepId: step.id,
      toolName: step.name,
      request: { dagId: job.dagId },
      response: step.detail,
      status: "succeeded",
      createdAt: completedAt
    }));

    const nodeExecutions = execution.nodeExecutions.map((nodeExecution) => ({
      ...nodeExecution,
      jobRunId: runId
    }));
    const nodeFeedback = execution.nodeFeedback;

    for (const step of steps) {
      await pool.query(
        `
          insert into job_run_steps (id, job_run_id, name, status, started_at, completed_at, detail)
          values ($1, $2, $3, $4, $5, $6, $7::jsonb)
        `,
        [step.id, step.jobRunId, step.name, step.status, step.startedAt, step.completedAt, JSON.stringify(step.detail)]
      );
    }

    for (const invocation of invocations) {
      await pool.query(
        `
          insert into tool_invocations (id, job_run_step_id, tool_name, request, response, status, created_at)
          values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
        `,
        [
          invocation.id,
          invocation.jobRunStepId,
          invocation.toolName,
          JSON.stringify(invocation.request),
          JSON.stringify(invocation.response ?? null),
          invocation.status,
          invocation.createdAt
        ]
      );
    }

    for (const nodeExecution of nodeExecutions) {
      await insertNodeExecution(pool, nodeExecution);
    }

    for (const feedback of nodeFeedback) {
      await insertNodeFeedback(pool, feedback);
    }

    await pool.query(
      `
        insert into job_memories (id, job_id, key, value, updated_at)
        values ($1, $2, $3, $4::jsonb, $5)
        on conflict (job_id, key)
        do update set value = excluded.value, updated_at = excluded.updated_at
      `,
      [memory.id, memory.jobId, memory.key, JSON.stringify(memory.value), memory.updatedAt]
    );

    await pool.query(
      `
        update job_runs
        set status = 'succeeded', completed_at = $2, output = $3::jsonb, error_message = null
        where id = $1
      `,
      [runId, completedAt, JSON.stringify({ ...execution.result.output, evaluation: execution.evaluation })]
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker execution failed";
    await pool.query("update job_runs set status = 'failed', completed_at = now(), error_message = $2 where id = $1", [
      runId,
      message
    ]);
  }

  return true;
}

async function insertNodeExecution(pool: Pool, nodeExecution: NodeExecution): Promise<void> {
  await pool.query(
    `
      insert into node_executions (
        id, job_run_id, node_id, node_type, status, input, output, latency_ms, token_usage, retry_count, started_at, completed_at
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12)
    `,
    [
      nodeExecution.id,
      nodeExecution.jobRunId,
      nodeExecution.nodeId,
      nodeExecution.nodeType,
      nodeExecution.status,
      JSON.stringify(nodeExecution.input),
      JSON.stringify(nodeExecution.output ?? null),
      nodeExecution.latencyMs,
      nodeExecution.tokenUsage,
      nodeExecution.retryCount,
      nodeExecution.startedAt,
      nodeExecution.completedAt ?? null
    ]
  );
}

async function insertNodeFeedback(pool: Pool, feedback: NodeFeedback): Promise<void> {
  await pool.query(
    `
      insert into node_feedback (
        id, node_execution_id, source_node_id, target_node_id, score, should_retry, summary, created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      feedback.id,
      feedback.nodeExecutionId,
      feedback.sourceNodeId,
      feedback.targetNodeId || null,
      feedback.score,
      feedback.shouldRetry,
      feedback.summary,
      feedback.createdAt
    ]
  );
}
