import type { FastifyInstance } from "fastify";
import type { AlertsService } from "../../services/alerts-service.js";
import { getUserContext } from "../../stub-user-context.js";

export function registerAlertsController(app: FastifyInstance, alertsService: AlertsService): void {
  app.get("/alerts", async () => {
    const items = await alertsService.listAlerts(getUserContext());
    return { items };
  });
}
