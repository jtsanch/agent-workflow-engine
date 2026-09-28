import "dotenv/config";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { Pool } from "pg";
import { PgBoss } from "pg-boss";
import { createLogger } from "@personal-agent-os/observability";
import { loadWorkerConfig } from "./config/config.js";
import { PostgresWorkerPersistenceRepository } from "./repositories/postgres/worker-persistence-repository.js";
import { RUN_EXECUTION_QUEUE, type RunExecutionJobData } from "./run-queue.js";
import { processQueuedRun } from "./runtime/queue-worker.js";

const logger = createLogger("worker");
const RUN_QUEUE_JOB_TIMEOUT_SECONDS = 60 * 60;

async function main() {
  const config = loadWorkerConfig();
  if (config.dbDriver !== "postgres") {
    logger.warn("Worker queue processing expects postgres. Exiting.", { driver: config.dbDriver });
    return;
  }

  const pool = new Pool({ connectionString: config.databaseUrl });
  const boss = new PgBoss({
    connectionString: config.databaseUrl,
    useListenNotify: true
  });
  const workerId = `worker_${randomUUID()}`;
  const persistence = new PostgresWorkerPersistenceRepository(pool, workerId);
  let shutdownRequested = false;
  let activeShutdown: Promise<void> | null = null;

  boss.on("error", (error) => {
    logger.error("Worker queue error", {
      workerId,
      error: error instanceof Error ? error.message : String(error)
    });
  });

  boss.on("warning", (warning) => {
    logger.warn("Worker queue warning", {
      workerId,
      ...warning
    });
  });

  await boss.start();
  await boss.createQueue(RUN_EXECUTION_QUEUE, {
    notify: true,
    retryLimit: 2,
    retryDelay: 5,
    retryBackoff: true,
    heartbeatSeconds: Math.max(10, Math.ceil(config.workerLeaseDurationMs / 1000)),
    expireInSeconds: RUN_QUEUE_JOB_TIMEOUT_SECONDS
  });
  await boss.updateQueue(RUN_EXECUTION_QUEUE, {
    notify: true,
    retryLimit: 2,
    retryDelay: 5,
    retryBackoff: true,
    heartbeatSeconds: Math.max(10, Math.ceil(config.workerLeaseDurationMs / 1000)),
    expireInSeconds: RUN_QUEUE_JOB_TIMEOUT_SECONDS
  });

  logger.info("Worker queue consumer started", {
    pollingIntervalMs: config.jobPollIntervalMs,
    concurrency: config.workerConcurrency,
    workerId,
    heartbeatIntervalMs: config.workerHeartbeatIntervalMs,
    queue: RUN_EXECUTION_QUEUE
  });

  const bossWorkerId = await boss.work<RunExecutionJobData>(
    RUN_EXECUTION_QUEUE,
    {
      batchSize: 1,
      localConcurrency: config.workerConcurrency,
      pollingIntervalSeconds: Math.max(0.5, config.jobPollIntervalMs / 1000),
      notifyPollingIntervalSeconds: Math.max(0.5, config.jobPollIntervalMs / 1000),
      heartbeatRefreshSeconds: Math.max(1, Math.floor(config.workerHeartbeatIntervalMs / 1000))
    },
    async ([job]) => {
      if (!job) {
        return;
      }

      await processQueuedRun(persistence, job.data);
    }
  );

  const shutdown = async (signal: string) => {
    if (activeShutdown) {
      return activeShutdown;
    }

    shutdownRequested = true;
    activeShutdown = (async () => {
      logger.info("Worker shutdown requested", { signal, workerId });
      await boss.offWork(RUN_EXECUTION_QUEUE, { id: bossWorkerId, wait: true });
      await boss.stop({
        close: true,
        graceful: true,
        timeout: config.workerShutdownGraceMs
      });
      await pool.end();
      logger.info("Worker shutdown complete", { signal, workerId });
      process.exit(0);
    })();

    return activeShutdown;
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  while (!shutdownRequested) {
    await sleep(1000);
  }

  if (activeShutdown) {
    await activeShutdown;
    return;
  }

  await boss.stop({ close: true, graceful: true, timeout: config.workerShutdownGraceMs });
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
