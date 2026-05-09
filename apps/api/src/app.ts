import type { FastifyInstance } from "fastify";
import { createHttpApp } from "./common/http.js";
import { registerAuthMiddleware } from "./common/auth-middleware.js";
import { registerErrorHandlers } from "./common/error-handler.js";
import type { AppContext } from "./app-context.js";
import { registerHealthController } from "./modules/health/controller.js";
import { registerAgentsController } from "./modules/agents/controller.js";
import { registerAuthController } from "./modules/auth/controller.js";
import { registerJobsController } from "./modules/jobs/controller.js";
import { registerRunsController } from "./modules/runs/controller.js";
import { registerAlertsController } from "./modules/alerts/controller.js";
import { registerSearchController } from "./modules/search/controller.js";
import { registerUsageController } from "./modules/usage/controller.js";
import { registerAdminController } from "./modules/admin/controller.js";

export async function buildApp(context: AppContext): Promise<FastifyInstance> {
  const app = await createHttpApp();

  registerHealthController(app, context.healthService);

  await app.register(async (protectedApp) => {
    registerAuthMiddleware(protectedApp, context.authContextService, context.config.clerkSecretKey);

    registerAuthController(protectedApp, context.userService, context.userUsageService);
    registerAgentsController(protectedApp, context.agentCatalogService);
    registerJobsController(protectedApp, context.jobsService);
    registerRunsController(protectedApp, context.runsService);
    registerUsageController(protectedApp, context.userUsageService);
    registerAdminController(protectedApp, context.adminUsersService);
    registerAlertsController(protectedApp, context.alertsService);
    registerSearchController(protectedApp, context.searchService);
  });

  registerErrorHandlers(app);

  app.addHook("onClose", async () => {
    await context.close();
  });

  return app;
}
