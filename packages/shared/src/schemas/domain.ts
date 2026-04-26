import { z } from "zod";
import { uiFormSchema } from "@personal-agent-os/ui-schema";

export const alertChannelSchema = z.enum(["email", "slack", "push"]);
export const jobStatusSchema = z.enum(["active", "paused", "disabled"]);
export const jobRunStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);
export const jobRunStepStatusSchema = z.enum(["pending", "running", "succeeded", "failed"]);
export const agentNodeTypeSchema = z.enum(["llm", "tool", "transform", "evaluator", "condition"]);
export const agentEdgeTypeSchema = z.enum(["data", "feedback", "control", "context"]);

export const jsonSchemaSchema: z.ZodType = z.lazy(() =>
  z.object({
    type: z.enum(["string", "integer", "number", "boolean", "object", "array", "null"]),
    title: z.string().optional(),
    description: z.string().optional(),
    properties: z.record(jsonSchemaSchema).optional(),
    required: z.array(z.string()).optional(),
    items: jsonSchemaSchema.optional(),
    additionalProperties: z.union([z.boolean(), jsonSchemaSchema]).optional(),
    enum: z.array(z.unknown()).optional()
  })
);

export const retryPolicySchema = z.object({
  maxRetries: z.number().int().min(0),
  strategy: z.enum(["regenerate", "rerun", "feedback_adjust"]),
  backoffMs: z.number().optional()
});

const dataRefSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("job_input"), path: z.string().optional() }),
  z.object({ source: z.literal("node_output"), nodeId: z.string(), path: z.string().optional() }),
  z.object({ source: z.literal("memory"), key: z.string(), path: z.string().optional() }),
  z.object({ source: z.literal("static"), value: z.unknown() }),
  z.object({ source: z.literal("context"), path: z.string() })
]);

const inputBindingSchema = z.object({
  key: z.string(),
  ref: dataRefSchema
});

const executionPolicySchema = z.object({
  timeoutMs: z.number().optional(),
  retryPolicy: retryPolicySchema.optional(),
  cachePolicy: z
    .object({
      enabled: z.boolean(),
      keyTemplate: z.string().optional(),
      ttlSeconds: z.number().optional()
    })
    .optional(),
  concurrencyKey: z.string().optional(),
  priority: z.number().optional()
});

const baseNodeSchema = z.object({
  id: z.string(),
  version: z.number(),
  type: agentNodeTypeSchema,
  name: z.string(),
  description: z.string().optional(),
  deterministic: z.boolean().optional(),
  writes: z.array(z.string()).optional(),
  input: z
    .object({
      schema: jsonSchemaSchema.optional(),
      bindings: z.array(inputBindingSchema).optional()
    })
    .optional(),
  output: z.object({
    schema: jsonSchemaSchema,
    outputKind: z.enum(["structured", "text", "decision", "critique"]).optional()
  }),
  execution: executionPolicySchema.optional(),
  tags: z.array(z.string()).optional()
});

export const toolNodeSchema = baseNodeSchema.extend({
  type: z.literal("tool"),
  toolName: z.string()
});

export const transformNodeSchema = baseNodeSchema.extend({
  type: z.literal("transform"),
  run: z.function().args(z.record(z.unknown()), z.unknown()).returns(z.union([z.unknown(), z.promise(z.unknown())]))
});

const llmOutputConfigSchema = z.object({
  schema: jsonSchemaSchema,
  enforcement: z.enum(["strict", "best_effort"])
});

const llmBaseNodeSchema = baseNodeSchema.extend({
  promptTemplate: z.string(),
  temperature: z.number().optional()
});

export const llmNodeSchema = llmBaseNodeSchema.extend({
  type: z.literal("llm"),
  model: z.string().optional(),
  maxTokens: z.number().optional(),
  outputConfig: llmOutputConfigSchema
});

export const evaluatorNodeSchema = llmBaseNodeSchema.extend({
  type: z.literal("evaluator"),
  model: z.string().optional()
});

export const conditionNodeSchema = baseNodeSchema.extend({
  type: z.literal("condition"),
  branches: z.array(z.object({ toNodeId: z.string() })).optional(),
  defaultToNodeId: z.string().optional()
});

export const agentNodeSchema = z.discriminatedUnion("type", [
  toolNodeSchema,
  transformNodeSchema,
  llmNodeSchema,
  evaluatorNodeSchema,
  conditionNodeSchema
]);

export const agentEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: agentEdgeTypeSchema.optional().default("data")
});

export const agentDagSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  description: z.string().optional(),
  nodes: z.array(agentNodeSchema).min(1),
  edges: z.array(agentEdgeSchema)
});

export const alertPreferenceSchema = z.object({
  id: z.string(),
  jobId: z.string().optional(),
  channel: alertChannelSchema,
  destination: z.string(),
  onSuccess: z.boolean(),
  onFailure: z.boolean()
});

export const agentDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  version: z.string(),
  name: z.string(),
  description: z.string(),
  inputSchema: jsonSchemaSchema,
  uiSchema: uiFormSchema,
  dag: agentDagSchema,
  defaultSchedule: z.string(),
  alertPreferences: z.array(alertPreferenceSchema),
  promptTemplate: z.string().optional(),
  tags: z.array(z.string())
});

export const jobSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  dagId: z.string(),
  agentDefinitionKey: z.string().optional(),
  status: jobStatusSchema,
  inputs: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const jobScheduleSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  scheduleExpression: z.string(),
  timezone: z.string(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const nodeOutputSchema = z.object({
  data: z.unknown(),
  artifacts: z.array(z.unknown())
});

export const jobRunSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  status: jobRunStatusSchema,
  triggerSource: z.enum(["manual", "schedule", "api"]),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  output: nodeOutputSchema.optional(),
  errorMessage: z.string().optional()
});

export const jobRunStepSchema = z.object({
  id: z.string(),
  jobRunId: z.string(),
  name: z.string(),
  status: jobRunStepStatusSchema,
  startedAt: z.string(),
  completedAt: z.string().optional(),
  detail: z.record(z.unknown()).optional()
});

export const toolInvocationSchema = z.object({
  id: z.string(),
  nodeExecutionId: z.string(),
  toolName: z.string(),
  toolVersion: z.string().optional(),
  request: z.record(z.unknown()),
  response: z.record(z.unknown()).optional(),
  status: z.enum(["pending", "succeeded", "failed"]),
  createdAt: z.string()
});

export const nodeExecutionSchema = z.object({
  id: z.string(),
  jobRunId: z.string(),
  nodeId: z.string(),
  nodeVersion: z.string(),
  nodeType: agentNodeTypeSchema,
  status: z.enum(["pending", "running", "succeeded", "failed", "skipped", "retry_scheduled", "cancelled"]),
  input: z.record(z.unknown()).optional(),
  resolvedInput: z.record(z.unknown()),
  output: nodeOutputSchema.optional(),
  errorMessage: z.string().optional(),
  latencyMs: z.number().optional(),
  tokenUsage: z.number().optional(),
  costUsd: z.number().optional(),
  retryCount: z.number(),
  startedAt: z.string(),
  completedAt: z.string().optional()
});

export const nodeFeedbackSchema = z.object({
  id: z.string(),
  nodeExecutionId: z.string(),
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
  score: z.number(),
  shouldRetry: z.boolean(),
  summary: z.string(),
  createdAt: z.string()
});

export const jobMemorySchema = z.object({
  id: z.string(),
  jobId: z.string(),
  key: z.string(),
  value: z.unknown(),
  updatedAt: z.string()
});

export const feedbackEventSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  jobRunId: z.string().optional(),
  score: z.number().min(1).max(5),
  comment: z.string().optional(),
  createdAt: z.string()
});

export const createJobInputSchema = z.object({
  agentDefinitionKey: z.string(),
  dagId: z.string().optional(),
  name: z.string().min(1),
  scheduleExpression: z.string().min(1),
  timezone: z.string().min(1),
  inputs: z.record(z.unknown()),
  alertPreferences: z.array(
    z.object({
      channel: alertChannelSchema,
      destination: z.string(),
      onSuccess: z.boolean().default(false),
      onFailure: z.boolean().default(true)
    })
  )
});

export const simulateRunInputSchema = z.object({
  jobId: z.string()
});

export type CreateJobInput = z.infer<typeof createJobInputSchema>;
export type SimulateRunInput = z.infer<typeof simulateRunInputSchema>;
