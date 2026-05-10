import { integer, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const userLlmUsageLimits = {
  userId: uuid("user_id").primaryKey(),
  dailyTokenLimit: integer("daily_token_limit").notNull(),
  monthlyTokenLimit: integer("monthly_token_limit").notNull(),
  perRunTokenLimit: integer("per_run_token_limit").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
};

export const userUsageCounters = {
  userId: uuid("user_id").primaryKey(),
  dailyTokens: integer("daily_tokens").notNull(),
  monthlyTokens: integer("monthly_tokens").notNull(),
  lastDailyReset: timestamp("last_daily_reset", { withTimezone: true }).notNull(),
  lastMonthlyReset: timestamp("last_monthly_reset", { withTimezone: true }).notNull()
};

export const usageEvents = {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  jobId: text("job_id"),
  jobRunId: text("job_run_id"),
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens").notNull(),
  completionTokens: integer("completion_tokens").notNull(),
  totalTokens: integer("total_tokens").notNull(),
  createdAt: timestamp("created_at").notNull()
};
