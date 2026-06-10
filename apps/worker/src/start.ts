import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createLogger } from "@personal-agent-os/observability";
import { loadWorkerConfig } from "./config/config.js";
import { PostgresWorkerPersistenceRepository } from "./repositories/postgres/worker-persistence-repository.js";
import { processNextQueuedRun } from "./runtime/queue-worker.js";

const logger = createLogger("worker");

async function main() {
  const config = loadWorkerConfig();
  if (config.dbDriver !== "postgres") {
    logger.warn("Worker queue processing expects postgres. Exiting.", { driver: config.dbDriver });
    return;
  }

  const pool = new Pool({ connectionString: config.databaseUrl });
  const workerId = `worker_${randomUUID()}`;
  const persistence = new PostgresWorkerPersistenceRepository(pool, workerId, config.workerLeaseDurationMs);
  let shutdownRequested = false;
  let activeRun: Promise<boolean> | null = null;
  let activeShutdown: Promise<void> | null = null;
  let sleepHandle: NodeJS.Timeout | null = null;
  let wakeSleep: (() => void) | null = null;

  logger.info("Worker polling loop started", {
    intervalMs: config.jobPollIntervalMs,
    concurrency: config.workerConcurrency,
    workerId,
    leaseDurationMs: config.workerLeaseDurationMs,
    heartbeatIntervalMs: config.workerHeartbeatIntervalMs
  });

  const shutdown = async (signal: string) => {
    if (activeShutdown) {
      return activeShutdown;
    }

    shutdownRequested = true;
    if (sleepHandle) {
      clearTimeout(sleepHandle);
      sleepHandle = null;
    }
    wakeSleep?.();
    wakeSleep = null;

    activeShutdown = (async () => {
      logger.info("Worker shutdown requested", { signal, workerId });

      if (activeRun) {
        const drained = await waitForActiveRun(activeRun, config.workerShutdownGraceMs);
        if (!drained) {
          logger.error("Worker shutdown grace period exceeded", {
            signal,
            workerId,
            graceMs: config.workerShutdownGraceMs
          });
          await pool.end().catch((error) => {
            logger.error("Worker pool close failed during forced shutdown", {
              workerId,
              error: error instanceof Error ? error.message : String(error)
            });
          });
          process.exit(1);
        }
      }

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
    activeRun = processNextQueuedRun(persistence, {
      heartbeatIntervalMs: config.workerHeartbeatIntervalMs
    });
    const didWork = await activeRun;
    activeRun = null;

    if (shutdownRequested) {
      break;
    }

    if (!didWork) {
      await new Promise<void>((resolve) => {
        wakeSleep = resolve;
        sleepHandle = setTimeout(() => {
          sleepHandle = null;
          wakeSleep = null;
          resolve();
        }, config.jobPollIntervalMs);
      });
    }
  }

  if (activeShutdown) {
    await activeShutdown;
    return;
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function waitForActiveRun(activeRun: Promise<boolean>, shutdownGraceMs: number): Promise<boolean> {
  return Promise.race([
    activeRun.then(() => true),
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), shutdownGraceMs);
    })
  ]);
}
