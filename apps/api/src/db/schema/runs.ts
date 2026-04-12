import { boolean, integer, jsonb, numeric, text, timestamp } from "drizzle-orm/pg-core";

export const jobRuns = {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  status: text("status").notNull(),
  triggerSource: text("trigger_source").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  output: jsonb("output").$type<Record<string, unknown> | null>(),
  errorMessage: text("error_message")
};

export const jobRunSteps = {
  id: text("id").primaryKey(),
  jobRunId: text("job_run_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  detail: jsonb("detail").$type<Record<string, unknown> | null>()
};

export const toolInvocations = {
  id: text("id").primaryKey(),
  jobRunStepId: text("job_run_step_id").notNull(),
  toolName: text("tool_name").notNull(),
  request: jsonb("request").$type<Record<string, unknown>>().notNull(),
  response: jsonb("response").$type<Record<string, unknown> | null>(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
};

export const jobMemories = {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  key: text("key").notNull(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
};

export const feedbackEvents = {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  jobRunId: text("job_run_id"),
  score: numeric("score").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
};

export const nodeExecutions = {
  id: text("id").primaryKey(),
  jobRunId: text("job_run_id").notNull(),
  nodeId: text("node_id").notNull(),
  nodeType: text("node_type").notNull(),
  status: text("status").notNull(),
  input: jsonb("input").$type<Record<string, unknown>>().notNull(),
  output: jsonb("output").$type<Record<string, unknown> | null>(),
  latencyMs: integer("latency_ms").notNull(),
  tokenUsage: integer("token_usage").notNull(),
  retryCount: integer("retry_count").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true })
};

export const nodeFeedback = {
  id: text("id").primaryKey(),
  nodeExecutionId: text("node_execution_id").notNull(),
  sourceNodeId: text("source_node_id").notNull(),
  targetNodeId: text("target_node_id"),
  score: numeric("score").notNull(),
  shouldRetry: boolean("should_retry").notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
};
