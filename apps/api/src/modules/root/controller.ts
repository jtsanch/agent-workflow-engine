import type { FastifyInstance } from "fastify";

export function registerRootController(app: FastifyInstance): void {
  app.get("/", async () => {
    return {
      service: "agent-workflow-engine-api",
      status: "ok"
    };
  });

  app.get("/favicon.ico", async (_request, reply) => {
    await reply.status(204).send();
  });

  app.get("/favicon.png", async (_request, reply) => {
    await reply.status(204).send();
  });
}
