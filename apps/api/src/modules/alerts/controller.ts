import type { FastifyInstance } from "fastify";
import { requireAuthContext } from "../../common/auth-middleware.js";
import type { AlertsService } from "../../services/alerts-service.js";

export function registerAlertsController(app: FastifyInstance, alertsService: AlertsService): void {
  app.get("/alerts", async (request) => {
    const authContext = requireAuthContext(request.authContext);
    const items = await alertsService.listAlerts({
      userId: authContext.localUserId,
      email: authContext.email
    });
    return { items };
  });
}
