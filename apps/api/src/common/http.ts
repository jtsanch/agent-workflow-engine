import Fastify from "fastify";
import cors from "@fastify/cors";
import type { AppConfig } from "../config/config.js";

export async function createHttpApp(config: Pick<AppConfig, "apiCorsOrigin">) {
  const app = Fastify({
    logger: false
  });

  await app.register(cors, {
    origin: config.apiCorsOrigin,
    credentials: true
  });

  return app;
}
