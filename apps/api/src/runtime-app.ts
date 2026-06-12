import type { FastifyInstance } from "fastify";
import { createAppContext } from "./app-context.js";
import { buildApp } from "./app.js";
import { loadConfig, type AppConfig } from "./config/config.js";

export async function createConfiguredApp(env: NodeJS.ProcessEnv = process.env): Promise<{
  app: FastifyInstance;
  config: AppConfig;
}> {
  const config = loadConfig(env);
  const context = createAppContext(config);
  const app = await buildApp(context);

  return { app, config };
}
