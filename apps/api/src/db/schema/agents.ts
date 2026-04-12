import { jsonb, text, timestamp } from "drizzle-orm/pg-core";

export const agentDags = {
  id: text("id").primaryKey(),
  agentDefinitionKey: text("agent_definition_key").notNull(),
  version: text("version").notNull(),
  name: text("name").notNull(),
  definition: jsonb("definition").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
};

export const agentNodes = {
  id: text("id").primaryKey(),
  dagId: text("dag_id").notNull(),
  nodeType: text("node_type").notNull(),
  agentKey: text("agent_key").notNull(),
  name: text("name").notNull(),
  inputMapping: jsonb("input_mapping").notNull(),
  outputSchema: jsonb("output_schema").notNull(),
  retryPolicy: jsonb("retry_policy")
};

export const agentEdges = {
  id: text("id").primaryKey(),
  dagId: text("dag_id").notNull(),
  fromNodeId: text("from_node_id").notNull(),
  toNodeId: text("to_node_id").notNull(),
  edgeType: text("edge_type").notNull()
};

export const jobDagVersions = {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  dagId: text("dag_id").notNull(),
  dagVersion: text("dag_version").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
};
