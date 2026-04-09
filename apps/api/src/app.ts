import type { FastifyInstance } from "fastify";
import { createHttpApp } from "./common/http.js";
import { registerErrorHandlers } from "./common/error-handler.js";
import type { AppContext } from "./app-context.js";
import { registerHealthController } from "./modules/health/controller.js";
import { registerAgentsController } from "./modules/agents/controller.js";
import { registerJobsController } from "./modules/jobs/controller.js";
import { registerRunsController } from "./modules/runs/controller.js";
import { registerAlertsController } from "./modules/alerts/controller.js";

export async function buildApp(context: AppContext): Promise<FastifyInstance> {
  const app = await createHttpApp();

  registerHealthController(app, context.healthService);
  registerAgentsController(app, context.agentCatalogService);
  registerJobsController(app, context.jobsService);
  registerRunsController(app, context.runsService);
  registerAlertsController(app, context.alertsService);
  registerErrorHandlers(app);

  app.addHook("onClose", async () => {
    await context.close();
  });

  return app;
}

