import type { FastifyInstance } from "fastify";
import { simulateRunInputSchema } from "@personal-agent-os/shared";
import type { RunsService } from "../../services/runs-service.js";
import { getUserContext } from "../../stub-user-context.js";

export function registerRunsController(app: FastifyInstance, runsService: RunsService): void {
  app.get("/runs", async () => {
    const items = await runsService.listRuns(getUserContext());
    return { items };
  });

  app.post("/runs", async (request, reply) => {
    const input = simulateRunInputSchema.parse(request.body);
    const item = await runsService.enqueueRun(input.jobId);
    return reply.status(201).send({ item });
  });

  app.post("/runs/simulate", async (request, reply) => {
    const input = simulateRunInputSchema.parse(request.body);
    const item = await runsService.simulateRun(input.jobId);
    return reply.status(201).send({ item });
  });
}
