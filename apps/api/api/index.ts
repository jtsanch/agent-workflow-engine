import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import "dotenv/config";
import { createAppContext } from "../src/app-context.js";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config.js";

let appPromise: Promise<FastifyInstance> | null = null;

function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = (async () => {
      const config = loadConfig();
      const context = createAppContext(config);
      const app = await buildApp(context);
        await app.ready();
        return app;
      })()
      .catch((error) => {
        appPromise = null;
        throw error;
      });
  }

  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getApp();
  app.server.emit("request", req, res);
}
