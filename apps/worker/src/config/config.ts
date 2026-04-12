import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DB_DRIVER: z.enum(["postgres", "memory"]).default("postgres"),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5433/personal_agent_os"),
  JOB_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  WORKER_CONCURRENCY: z.coerce.number().default(5)
});

export type WorkerConfig = {
  env: "development" | "test" | "production";
  dbDriver: "postgres" | "memory";
  databaseUrl: string;
  jobPollIntervalMs: number;
  workerConcurrency: number;
};

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = schema.safeParse(env);

  if (!parsed.success) {
    console.error("Invalid worker environment variables");
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Worker environment validation failed");
  }

  const data = parsed.data;

  return Object.freeze({
    env: data.NODE_ENV,
    dbDriver: data.DB_DRIVER,
    databaseUrl: data.DATABASE_URL,
    jobPollIntervalMs: data.JOB_POLL_INTERVAL_MS,
    workerConcurrency: data.WORKER_CONCURRENCY
  });
}
