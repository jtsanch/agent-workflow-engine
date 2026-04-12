import type {
  AlertPreference,
  FeedbackEvent,
  Job,
  JobMemory,
  JobRun,
  JobRunStep,
  JobSchedule,
  ToolInvocation
} from "@personal-agent-os/shared";
import { asRecord } from "../sql-helpers.js";

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
    inputs: asRecord(row.inputs ?? row.input),
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
    output: row.output ? asRecord(row.output) : undefined,
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
    detail: row.detail ? asRecord(row.detail) : undefined
  };
}

export function mapToolInvocation(row: Record<string, unknown>): ToolInvocation {
  return {
    id: String(row.id),
    jobRunStepId: String(row.job_run_step_id ?? row.jobRunStepId),
    toolName: String(row.tool_name ?? row.toolName),
    request: asRecord(row.request),
    response: row.response ? asRecord(row.response) : undefined,
    status: row.status as ToolInvocation["status"],
    createdAt: new Date(String(row.created_at ?? row.createdAt)).toISOString()
  };
}

export function mapJobMemory(row: Record<string, unknown>): JobMemory {
  return {
    id: String(row.id),
    jobId: String(row.job_id ?? row.jobId),
    key: String(row.key),
    value: asRecord(row.value),
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
