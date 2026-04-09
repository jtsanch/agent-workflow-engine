import { createLogger, createMetrics } from "@personal-agent-os/observability";
import { loadConfig } from "./config/env.js";
import { buildApp } from "./app.js";
import { createAppContext } from "./app-context.js";

async function main() {
  const config = loadConfig();
  const logger = createLogger("api");
  const metrics = createMetrics();
  const context = createAppContext(config);
  const app = await buildApp(context);

  await app.listen({
    port: config.PORT,
    host: "0.0.0.0"
  });

  logger.info("API listening", { port: config.PORT, driver: config.DB_DRIVER });
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
