import type { FastifyInstance } from "fastify";
import type { AgentCatalogService } from "../../services/agent-catalog.js";

export function registerAgentsController(app: FastifyInstance, agentCatalogService: AgentCatalogService): void {
  app.get("/agents", async () => {
    return { items: agentCatalogService.list() };
  });
}
