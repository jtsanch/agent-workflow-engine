import type { UiFormSchema } from "@personal-agent-os/ui-schema";

export type EntityId = string;
export type Timestamp = string;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type JobStatus = "active" | "paused" | "disabled";
export type JobRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type NodeStatus = "pending" | "running" | "completed" | "failed";
export type NodeExecutionStatus =
    | "pending"
    | "running"
    | "succeeded"
    | "failed"
    | "skipped"
    | "retry_scheduled"
    | "cancelled";

export type AlertChannel = "email" | "slack" | "push";

export type AgentNodeType =
    | "llm"
    | "tool"
    | "transform"
    | "evaluator"
    | "condition";


export type JsonSchemaType =
    | "string"
    | "number"
    | "integer"
    | "boolean"
    | "object"
    | "array"
    | "null";

export interface JSONSchema<T = unknown> {
  $id?: string;
  version?: string;
  title?: string;
  description?: string;
  type?: JsonSchemaType | JsonSchemaType[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  additionalProperties?: boolean | JSONSchema;
  enum?: readonly unknown[];
  const?: unknown;
  default?: unknown;
  nullable?: boolean;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  format?: string;
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  definitions?: Record<string, JSONSchema>;
}

export interface RetryPolicy {
  maxRetries: number;
  strategy: "regenerate" | "rerun" | "feedback_adjust";
  backoffMs?: number;
}

export interface CachePolicy {
  enabled: boolean;
  keyTemplate?: string;
  ttlSeconds?: number;
}

export interface ExecutionPlan {
  prompt: string;
  toolHints: string[];
}
export interface ExecutionPolicy {
  timeoutMs?: number;
  retryPolicy?: RetryPolicy;
  cachePolicy?: CachePolicy;
  concurrencyKey?: string;
  priority?: number;
}

export type DataRef =
    | { source: "job_input"; path?: string }
    | { source: "node_output"; nodeId: string; path?: string }
    | { source: "memory"; key: string; path?: string }
    | { source: "static"; value: JsonValue }
    | { source: "context"; path: string };

export interface InputBinding {
  key: string;
  ref: DataRef;
  optional?: boolean;
}

export interface NodeOutput<TOutput = unknown> {
  data: TOutput;
  artifacts: unknown[];
}

export interface NodeRuntime {
  status: NodeStatus;
  retryCount: number;
  lastError?: string;
}

export interface NodeOutputEntry {
  attempt: number;
  data: unknown;
  artifacts?: unknown[];
  success: boolean;
  timestamp: number;
  error?: string;
}

export interface NodeInstance {
  nodeInstanceId: string;
  nodeId: string;
  index: number;
  input: Record<string, unknown>;
}

export interface OutputContract<TOutput = JsonObject> {
  schema: JSONSchema<TOutput>;
  outputKind?: "structured" | "text" | "decision" | "critique";
}

export interface BaseNode<TInput = JsonObject, TOutput = JsonObject> {
  id: string;
  version: string;
  type: AgentNodeType;
  name: string;
  description?: string;
  deterministic?: boolean;
  writes?: string[];
  input?: {
    schema?: JSONSchema<TInput>;
    bindings?: InputBinding[];
  };
  memory?: MemoryWrite[];
  output: OutputContract<TOutput>;
  execution?: ExecutionPolicy;
  tags?: string[];
}

export type MemoryWrite = {
  key: string;
  from: string;
  operation?: "set" | "append";
  scope?: "job" | "user" | "global";
}

export interface ToolNode<TInput = JsonObject, TOutput = JsonObject>
    extends BaseNode<TInput, TOutput> {
  type: "tool";
  toolName: string;
}

export interface TransformNode<TInput = JsonObject, TOutput = JsonObject>
    extends BaseNode<TInput, TOutput> {
  type: "transform";
  run: (
    input: TInput,
    context: unknown,
  ) => Promise<TOutput> | TOutput;
}

export interface LLMOutputConfig<TOutput = JsonObject> {
  schema: JSONSchema<TOutput>;
  enforcement: "strict" | "best_effort";
}

export interface LLMNode<TInput = JsonObject, TOutput = JsonObject>
    extends BaseNode<TInput, TOutput> {
  type: "llm";
  promptTemplate: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  outputConfig: LLMOutputConfig<TOutput>;
}

export interface EvaluationSignal {
  retry: boolean;
  strategy?: "regenerate" | "rerun" | "feedback_adjust";
  targetNodeId?: string;
}

export interface EvaluationResult {
  score: number;
  passed: boolean;
  issues: string[];
  summary: string;
  shouldRetry: boolean;
  retryTargetNodeId?: string;
  signal?: EvaluationSignal;
}

export interface EvaluatorNode<TInput = JsonObject>
    extends BaseNode<TInput, EvaluationResult> {
  type: "evaluator";
  promptTemplate: string;
  model?: string;
  temperature?: number;
}

export interface ConditionBranch {
  toNodeId: string;
}

export interface ConditionNode<TInput = JsonObject>
    extends BaseNode<TInput, { selectedBranch: string }> {
  type: "condition";
  branches?: ConditionBranch[];
  defaultToNodeId?: string;
}

export type AgentNode =
    | ToolNode
    | TransformNode
    | LLMNode
    | EvaluatorNode
    | ConditionNode;

export interface AgentDAG {
  id: string;
  version: string;
  name: string;
  description?: string;
  nodes: AgentNode[];
}

export type CompiledDAG = {
  nodes: AgentNode[];
  nodeMap: Map<string, AgentNode>;
  graph: {
    forward: Record<string, Set<string>>;
    reverse: Record<string, Set<string>>;
  };
};

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
  inputSchema: JSONSchema;
  uiSchema: UiFormSchema;
  dag: AgentDAG;
  defaultSchedule?: string;
  alertPreferences?: AlertPreference[];
  promptTemplate?: string;
  tags?: string[];
}

export interface Job {
  id: EntityId;
  userId: EntityId;
  name: string;
  dagId: string;
  agentDefinitionKey?: string;
  status: JobStatus;
  inputs: JsonObject;
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

export interface JobRunBudget {
  maxTokens?: number;
  consumedTokens?: number;
  maxCostUsd?: number;
  consumedCostUsd?: number;
}

export interface JobRun {
  id: EntityId;
  jobId: EntityId;
  status: JobRunStatus;
  triggerSource: "manual" | "schedule" | "api";
  startedAt: Timestamp;
  completedAt?: Timestamp;
  output?: NodeOutput;
  errorMessage?: string;
  budget?: JobRunBudget;
}

export interface JobRunStep {
  id: EntityId;
  jobRunId: EntityId;
  name: string;
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  startedAt: Timestamp;
  completedAt?: Timestamp;
  detail?: JsonValue;
}

export interface NodeExecution {
  id: EntityId;
  jobRunId: EntityId;
  nodeId: string;
  nodeVersion: string;
  nodeType: AgentNodeType;
  status: NodeExecutionStatus;
  input?: JsonObject;
  resolvedInput: Record<string, unknown>;
  output?: NodeOutput;
  errorMessage?: string;
  latencyMs?: number;
  tokenUsage?: number;
  costUsd?: number;
  retryCount: number;
  startedAt: Timestamp;
  completedAt?: Timestamp;
}

export interface ToolInvocation {
  id: EntityId;
  nodeExecutionId: EntityId;
  toolName: string;
  toolVersion?: string;
  request: JsonObject;
  response?: JsonObject;
  status: "pending" | "succeeded" | "failed";
  createdAt: Timestamp;
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

export interface JobMemoryEntry {
  id: EntityId;
  jobId: EntityId;
  key: string;
  value: JsonValue;
  nodeId?: string;
  updatedAt: Timestamp;
}

export type JobMemory = JobMemoryEntry;

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
  email?: string;
  timezone?: string;
}
