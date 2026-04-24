import type {
  AlertPreference,
  FeedbackEvent,
  Job,
  JobMemory,
  JobRun,
  JobRunStep,
  JobSchedule,
  NodeExecution,
  NodeFeedback,
  ToolInvocation
} from "@personal-agent-os/shared";
import { asJsonObject, asJsonValue, asNodeOutput, asRecord } from "../sql-helpers.js";

export function mapJob(row: Record<string, unknown>): Job {
  return {
    id: String(row.id),
    userId: String(row.user_id ?? row.userId),
    name: String(row.name),
    dagId: row.dag_id ? String(row.dag_id) : row.dagId ? String(row.dagId) : "",
    agentDefinitionKey: row.agent_definition_key
      ? String(row.agent_definition_key)
      : row.agentDefinitionKey
        ? String(row.agentDefinitionKey)
        : undefined,
    status: row.status as Job["status"],
    inputs: asJsonObject(row.inputs ?? row.input),
    createdAt: new Date(String(row.created_at ?? row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updated_at ?? row.updatedAt)).toISOString()
  };
}

export function mapJobSchedule(row: Record<string, unknown>): JobSchedule {
  return {
    id: String(row.id),
    jobId: String(row.job_id ?? row.jobId),
    scheduleExpression: String(row.schedule_expression ?? row.scheduleExpression),
    timezone: String(row.timezone),
    enabled: Boolean(row.enabled),
    createdAt: new Date(String(row.created_at ?? row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updated_at ?? row.updatedAt)).toISOString()
  };
}

export function mapAlertPreference(row: Record<string, unknown>): AlertPreference {
  return {
    id: String(row.id),
    jobId: row.job_id ? String(row.job_id) : row.jobId ? String(row.jobId) : undefined,
    channel: row.channel as AlertPreference["channel"],
    destination: String(row.destination),
    onSuccess: Boolean(row.on_success ?? row.onSuccess),
    onFailure: Boolean(row.on_failure ?? row.onFailure)
  };
}

export function mapJobRun(row: Record<string, unknown>): JobRun {
  const rawOutput = row.output;
  const normalizedOutput =
    rawOutput == null
      ? undefined
      : typeof rawOutput === "object" &&
          rawOutput !== null &&
          "data" in rawOutput &&
          "artifacts" in rawOutput
        ? rawOutput as JobRun["output"]
        : { data: rawOutput, artifacts: [] };

  return {
    id: String(row.id),
    jobId: String(row.job_id ?? row.jobId),
    status: row.status as JobRun["status"],
    triggerSource: (row.trigger_source ?? row.triggerSource) as JobRun["triggerSource"],
    startedAt: new Date(String(row.started_at ?? row.startedAt)).toISOString(),
    completedAt: row.completed_at
      ? new Date(String(row.completed_at)).toISOString()
      : row.completedAt
        ? new Date(String(row.completedAt)).toISOString()
        : undefined,
    output: normalizedOutput,
    errorMessage:
      row.error_message !== undefined && row.error_message !== null
        ? String(row.error_message)
        : row.errorMessage !== undefined && row.errorMessage !== null
          ? String(row.errorMessage)
          : undefined
  };
}

export function mapJobRunStep(row: Record<string, unknown>): JobRunStep {
  return {
    id: String(row.id),
    jobRunId: String(row.job_run_id ?? row.jobRunId),
    name: String(row.name),
    status: row.status as JobRunStep["status"],
    startedAt: new Date(String(row.started_at ?? row.startedAt)).toISOString(),
    completedAt: row.completed_at
      ? new Date(String(row.completed_at)).toISOString()
      : row.completedAt
        ? new Date(String(row.completedAt)).toISOString()
        : undefined,
    detail: row.detail !== undefined && row.detail !== null ? asJsonValue(row.detail) : undefined
  };
}

export function mapToolInvocation(row: Record<string, unknown>): ToolInvocation {
  return {
    id: String(row.id),
    nodeExecutionId: String(row.node_execution_id ?? row.nodeExecutionId),
    toolName: String(row.tool_name ?? row.toolName),
    request: asJsonObject(row.request),
    response: row.response ? asJsonObject(row.response) : undefined,
    status: row.status as ToolInvocation["status"],
    createdAt: new Date(String(row.created_at ?? row.createdAt)).toISOString()
  };
}

export function mapJobMemory(row: Record<string, unknown>): JobMemory {
  return {
    id: String(row.id),
    jobId: String(row.job_id ?? row.jobId),
    key: String(row.key),
    value: asJsonValue(row.value),
    nodeId:
      row.node_id !== undefined && row.node_id !== null
        ? String(row.node_id)
        : row.nodeId !== undefined && row.nodeId !== null
          ? String(row.nodeId)
          : undefined,
    updatedAt: new Date(String(row.updated_at ?? row.updatedAt)).toISOString()
  };
}

export function mapFeedbackEvent(row: Record<string, unknown>): FeedbackEvent {
  return {
    id: String(row.id),
    jobId: String(row.job_id ?? row.jobId),
    jobRunId: row.job_run_id ? String(row.job_run_id) : row.jobRunId ? String(row.jobRunId) : undefined,
    score: Number(row.score),
    comment: row.comment ? String(row.comment) : undefined,
    createdAt: new Date(String(row.created_at ?? row.createdAt)).toISOString()
  };
}

export function mapNodeExecution(row: Record<string, unknown>): NodeExecution {
  const resolvedInput = asRecord(row.resolved_input ?? row.resolvedInput ?? row.input);
  return {
    id: String(row.id),
    jobRunId: String(row.job_run_id ?? row.jobRunId),
    nodeId: String(row.node_id ?? row.nodeId),
    nodeVersion: String(row.node_version ?? row.nodeVersion ?? "1.0.0"),
    nodeType: (row.node_type ?? row.nodeType) as NodeExecution["nodeType"],
    status: row.status as NodeExecution["status"],
    input: asJsonObject(row.input ?? row.resolved_input ?? row.resolvedInput),
    resolvedInput,
    output: asNodeOutput(row.output),
    errorMessage: row.error_message ? String(row.error_message) : row.errorMessage ? String(row.errorMessage) : undefined,
    latencyMs:
      row.latency_ms != null || row.latencyMs != null
        ? Number(row.latency_ms ?? row.latencyMs)
        : undefined,
    tokenUsage:
      row.token_usage != null || row.tokenUsage != null
        ? Number(row.token_usage ?? row.tokenUsage)
        : undefined,
    costUsd:
      row.cost_usd != null || row.costUsd != null
        ? Number(row.cost_usd ?? row.costUsd)
        : undefined,
    retryCount: Number(row.retry_count ?? row.retryCount ?? 0),
    startedAt: new Date(String(row.started_at ?? row.startedAt)).toISOString(),
    completedAt: row.completed_at
      ? new Date(String(row.completed_at)).toISOString()
      : row.completedAt
        ? new Date(String(row.completedAt)).toISOString()
        : undefined
  };
}

export function mapNodeFeedback(row: Record<string, unknown>): NodeFeedback {
  return {
    id: String(row.id),
    nodeExecutionId: String(row.node_execution_id ?? row.nodeExecutionId),
    sourceNodeId: String(row.source_node_id ?? row.sourceNodeId),
    targetNodeId: row.target_node_id ? String(row.target_node_id) : row.targetNodeId ? String(row.targetNodeId) : "",
    score: Number(row.score),
    shouldRetry: Boolean(row.should_retry ?? row.shouldRetry),
    summary: String(row.summary),
    createdAt: new Date(String(row.created_at ?? row.createdAt)).toISOString()
  };
}
