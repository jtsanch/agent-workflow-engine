import { boolean, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const jobs = {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  agentDefinitionKey: text("agent_definition_key"),
  dagId: text("dag_id"),
  name: text("name").notNull(),
  status: text("status").notNull(),
  input: jsonb("input").$type<Record<string, unknown>>().notNull(),
  inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
};

export const jobSchedules = {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  scheduleExpression: text("schedule_expression").notNull(),
  timezone: text("timezone").notNull(),
  enabled: boolean("enabled").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
};

export const jobAlertPreferences = {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  channel: text("channel").notNull(),
  destination: text("destination").notNull(),
  onSuccess: boolean("on_success").notNull(),
  onFailure: boolean("on_failure").notNull()
};
