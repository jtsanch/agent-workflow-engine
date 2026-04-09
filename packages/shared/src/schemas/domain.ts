import { z } from "zod";
import { uiFormSchema } from "@personal-agent-os/ui-schema";

export const alertChannelSchema = z.enum(["email", "slack", "push"]);
export const jobStatusSchema = z.enum(["active", "paused", "disabled"]);
export const jobRunStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);
export const jobRunStepStatusSchema = z.enum(["pending", "running", "succeeded", "failed"]);
export const agentNodeTypeSchema = z.enum(["llm", "tool", "evaluator", "aggregator"]);
export const agentEdgeTypeSchema = z.enum(["data", "feedback"]);

export const structuredSchemaFieldSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean", "object", "array"]),
  description: z.string().optional(),
  required: z.boolean().optional()
});

export const structuredSchemaSchema = z.object({
  title: z.string(),
  fields: z.array(structuredSchemaFieldSchema)
});

export const retryPolicySchema = z.object({
  maxRetries: z.number().int().min(0),
  strategy: z.enum(["feedback", "replan"])
});

export const agentNodeSchema = z.object({
  id: z.string(),
  type: agentNodeTypeSchema,
  agentKey: z.string(),
  name: z.string(),
  description: z.string().optional(),
  inputMapping: z.record(z.string()),
  outputSchema: structuredSchemaSchema,
  config: z.record(z.unknown()).optional(),
  retryPolicy: retryPolicySchema.optional()
});

export const agentEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: agentEdgeTypeSchema
});

export const agentDagSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  nodes: z.array(agentNodeSchema).min(1),
  edges: z.array(agentEdgeSchema),
  entryNodeIds: z.array(z.string()).min(1),
  exitNodeId: z.string()
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
  inputSchema: structuredSchemaSchema,
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

export const jobRunSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  status: jobRunStatusSchema,
  triggerSource: z.enum(["manual", "schedule", "api"]),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  output: z.record(z.unknown()).optional(),
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
  jobRunStepId: z.string(),
  toolName: z.string(),
  request: z.record(z.unknown()),
  response: z.record(z.unknown()).optional(),
  status: z.enum(["pending", "succeeded", "failed"]),
  createdAt: z.string()
});

export const nodeExecutionSchema = z.object({
  id: z.string(),
  jobRunId: z.string(),
  nodeId: z.string(),
  nodeType: agentNodeTypeSchema,
  status: z.enum(["running", "succeeded", "failed", "retry_scheduled"]),
  input: z.record(z.unknown()),
  output: z.record(z.unknown()).optional(),
  latencyMs: z.number(),
  tokenUsage: z.number(),
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
  value: z.record(z.unknown()),
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

