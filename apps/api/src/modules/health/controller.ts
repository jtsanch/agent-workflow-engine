import type { FastifyInstance } from "fastify";
import type { HealthService } from "../../services/health-service.js";

export function registerHealthController(app: FastifyInstance, healthService: HealthService): void {
  app.get("/health", async () => {
    return { ok: true, service: "api" };
  });

  app.get("/ready", async (_request, reply) => {
    const readiness = await healthService.getReadiness();
    return reply.status(readiness.ok ? 200 : 503).send(readiness);
  });
}
