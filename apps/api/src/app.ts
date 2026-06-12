import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { registerAuthMiddleware } from "./common/auth-middleware.js";
import { registerErrorHandlers } from "./common/error-handler.js";
import type { AppContext } from "./app-context.js";
import type { AppConfig } from "./config/config.js";
import { registerHealthController } from "./modules/health/controller.js";
import { registerRootController } from "./modules/root/controller.js";
import { registerAgentsController } from "./modules/agents/controller.js";
import { registerAuthController } from "./modules/auth/controller.js";
import { registerJobsController } from "./modules/jobs/controller.js";
import { registerRunsController } from "./modules/runs/controller.js";
import { registerAlertsController } from "./modules/alerts/controller.js";
import { registerSearchController } from "./modules/search/controller.js";
import { registerUsageController } from "./modules/usage/controller.js";
import { registerAdminController } from "./modules/admin/controller.js";

async function createHttpApp(config: Pick<AppConfig, "apiCorsOrigin">): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false
  });

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, config.apiCorsOrigin.includes(origin));
    },
    credentials: true
  });

  return app;
}

export async function buildApp(context: AppContext): Promise<FastifyInstance> {
  const app = await createHttpApp(context.config);

  registerRootController(app);
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
