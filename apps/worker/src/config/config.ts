import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DB_DRIVER: z.enum(["postgres", "memory"]).default("postgres"),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5433/personal_agent_os"),
  JOB_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  WORKER_CONCURRENCY: z.coerce.number().default(1),
  WORKER_LEASE_DURATION_MS: z.coerce.number().positive().default(30000),
  WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().positive().default(10000),
  WORKER_SHUTDOWN_GRACE_MS: z.coerce.number().positive().default(30000)
});

export type WorkerConfig = {
  env: "development" | "test" | "production";
  dbDriver: "postgres" | "memory";
  databaseUrl: string;
  jobPollIntervalMs: number;
  workerConcurrency: number;
  workerLeaseDurationMs: number;
  workerHeartbeatIntervalMs: number;
  workerShutdownGraceMs: number;
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
    workerConcurrency: data.WORKER_CONCURRENCY,
    workerLeaseDurationMs: data.WORKER_LEASE_DURATION_MS,
    workerHeartbeatIntervalMs: data.WORKER_HEARTBEAT_INTERVAL_MS,
    workerShutdownGraceMs: data.WORKER_SHUTDOWN_GRACE_MS
  });
}
