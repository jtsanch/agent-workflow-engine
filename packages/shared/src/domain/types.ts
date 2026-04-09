import type { UiFormSchema } from "@personal-agent-os/ui-schema";

export type EntityId = string;
export type Timestamp = string;

export type JobStatus = "active" | "paused" | "disabled";
export type JobRunStatus = "queued" | "running" | "succeeded" | "failed";
export type JobRunStepStatus = "pending" | "running" | "succeeded" | "failed";
export type AlertChannel = "email" | "slack" | "push";
export type AgentNodeType = "llm" | "tool" | "evaluator" | "aggregator";
export type AgentEdgeType = "data" | "feedback";

export interface StructuredSchemaField {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  required?: boolean;
}

export interface StructuredSchema {
  title: string;
  fields: StructuredSchemaField[];
}

export interface RetryPolicy {
  maxRetries: number;
  strategy: "feedback" | "replan";
}

export interface AgentNode {
  id: string;
  type: AgentNodeType;
  agentKey: string;
  name: string;
  description?: string;
  inputMapping: Record<string, string>;
  outputSchema: StructuredSchema;
  config?: Record<string, unknown>;
  retryPolicy?: RetryPolicy;
}

export interface AgentEdge {
  from: string;
  to: string;
  type: AgentEdgeType;
}

export interface AgentDAG {
  id: string;
  version: string;
  name: string;
  nodes: AgentNode[];
  edges: AgentEdge[];
  entryNodeIds: string[];
  exitNodeId: string;
}

export interface AlertPreference {
  id: string;
  jobId?: EntityId;
  channel: AlertChannel;
  destination: string;
  onSuccess: boolean;
  onFailure: boolean;
}

export interface AgentDefinition {
  id: string;
  key: string;
  version: string;
  name: string;
  description: string;
  inputSchema: StructuredSchema;
  uiSchema: UiFormSchema;
  dag: AgentDAG;
  defaultSchedule: string;
  alertPreferences: AlertPreference[];
  promptTemplate?: string;
  tags: string[];
}

export interface Job {
  id: EntityId;
  userId: EntityId;
  name: string;
  dagId: string;
  agentDefinitionKey?: string;
  status: JobStatus;
  inputs: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface JobSchedule {
  id: EntityId;
  jobId: EntityId;
  scheduleExpression: string;
  timezone: string;
  enabled: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface JobRun {
  id: EntityId;
  jobId: EntityId;
  status: JobRunStatus;
  triggerSource: "manual" | "schedule" | "api";
  startedAt: Timestamp;
  completedAt?: Timestamp;
  output?: Record<string, unknown>;
  errorMessage?: string;
}

export interface JobRunStep {
  id: EntityId;
  jobRunId: EntityId;
  name: string;
  status: JobRunStepStatus;
  startedAt: Timestamp;
  completedAt?: Timestamp;
  detail?: Record<string, unknown>;
}

export interface ToolInvocation {
  id: EntityId;
  jobRunStepId: EntityId;
  toolName: string;
  request: Record<string, unknown>;
  response?: Record<string, unknown>;
  status: "pending" | "succeeded" | "failed";
  createdAt: Timestamp;
}

export interface NodeExecution {
  id: EntityId;
  jobRunId: EntityId;
  nodeId: string;
  nodeType: AgentNodeType;
  status: "running" | "succeeded" | "failed" | "retry_scheduled";
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  latencyMs: number;
  tokenUsage: number;
  retryCount: number;
  startedAt: Timestamp;
  completedAt?: Timestamp;
}

export interface NodeFeedback {
  id: EntityId;
  nodeExecutionId: EntityId;
  sourceNodeId: string;
  targetNodeId: string;
  score: number;
  shouldRetry: boolean;
  summary: string;
  createdAt: Timestamp;
}

export interface JobMemory {
  id: EntityId;
  jobId: EntityId;
  key: string;
  value: Record<string, unknown>;
  updatedAt: Timestamp;
}

export interface FeedbackEvent {
  id: EntityId;
  jobId: EntityId;
  jobRunId?: EntityId;
  score: number;
  comment?: string;
  createdAt: Timestamp;
}

export interface UserContext {
  userId: string;
  email: string;
}

