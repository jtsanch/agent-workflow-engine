import "dotenv/config";
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
  const persistence = new PostgresWorkerPersistenceRepository(pool);

  logger.info("Worker polling loop started", {
    intervalMs: config.jobPollIntervalMs,
    concurrency: config.workerConcurrency
  });

  while (true) {
    const didWork = await processNextQueuedRun(persistence);
    if (!didWork) {
      await new Promise((resolve) => setTimeout(resolve, config.jobPollIntervalMs));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
