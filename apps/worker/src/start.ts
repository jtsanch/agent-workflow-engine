import { Pool } from "pg";
import { createLogger } from "@personal-agent-os/observability";
import { loadWorkerConfig } from "./config/env.js";
import { processNextQueuedRun } from "./runtime/queue-worker.js";

const logger = createLogger("worker");

async function main() {
  const config = loadWorkerConfig();
  if (config.DB_DRIVER !== "postgres") {
    logger.warn("Worker queue processing expects postgres. Exiting.", { driver: config.DB_DRIVER });
    return;
  }

  const pool = new Pool({ connectionString: config.DATABASE_URL });

  logger.info("Worker polling loop started", {
    intervalMs: config.JOB_POLL_INTERVAL_MS,
    concurrency: config.WORKER_CONCURRENCY
  });

  while (true) {
    const didWork = await processNextQueuedRun(pool);
    if (!didWork) {
      await new Promise((resolve) => setTimeout(resolve, config.JOB_POLL_INTERVAL_MS));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
