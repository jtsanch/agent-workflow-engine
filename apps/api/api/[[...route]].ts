import type { IncomingMessage, ServerResponse } from "node:http";
import "dotenv/config";
import { createConfiguredApp } from "../src/runtime-app.js";

const appPromise = (async () => {
  const { app } = await createConfiguredApp();
  await app.ready();
  return app;
})();

function normalizeRequestUrl(url: string | undefined): string {
  if (!url || url === "/api" || url === "/api/") {
    return "/";
  }

  if (url.startsWith("/api/")) {
    return url.slice(4);
  }

  return url;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await appPromise;
  req.url = normalizeRequestUrl(req.url);

  await new Promise<void>((resolve, reject) => {
    res.once("finish", resolve);
    res.once("error", reject);
    app.server.emit("request", req, res);
  });
}
