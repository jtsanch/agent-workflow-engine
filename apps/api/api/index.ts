import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import "dotenv/config";
import { createConfiguredApp } from "../src/runtime-app.js";

let appPromise: Promise<FastifyInstance> | null = null;

function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = createConfiguredApp()
      .then(async ({ app }) => {
        await app.ready();
        return app;
      })
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
