import Fastify from "fastify";
import cors from "@fastify/cors";

export async function createHttpApp() {
  const app = Fastify({
    logger: false
  });

  await app.register(cors, {
    origin: true
  });

  return app;
}
