import "dotenv/config";
import { createLogger, createMetrics } from "@personal-agent-os/observability";
import { createConfiguredApp } from "./runtime-app.js";

async function main() {
  const logger = createLogger("api");
  const metrics = createMetrics();
  const { app, config } = await createConfiguredApp();

  await app.listen({
    port: config.port,
    host: "0.0.0.0"
  });

  logger.info("API listening", { port: config.port, driver: config.dbDriver });
  metrics.increment("api.started");

  const shutdown = async (signal: string) => {
    logger.info("API shutdown requested", { signal });
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
