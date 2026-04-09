import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DB_DRIVER: z.enum(["postgres", "memory"]).default("postgres"),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5433/personal_agent_os"),
  JOB_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  WORKER_CONCURRENCY: z.coerce.number().default(5)
});

export type WorkerConfig = z.infer<typeof envSchema>;

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return envSchema.parse(env);
}
