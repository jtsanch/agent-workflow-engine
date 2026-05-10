import type { FastifyInstance } from "fastify";
import { simulateRunInputSchema } from "@personal-agent-os/shared";
import { requireAuthContext } from "../../common/auth-middleware.js";
import type { RunsService } from "../../services/runs-service.js";

export function registerRunsController(app: FastifyInstance, runsService: RunsService): void {
  app.get("/runs", async (request) => {
    const authContext = requireAuthContext(request.authContext);
    const items = await runsService.listRuns({
      userId: authContext.localUserId,
      email: authContext.email
    });
    return { items };
  });

  app.get<{ Params: { runId: string } }>("/runs/:runId", async (request) => {
    const authContext = requireAuthContext(request.authContext);
    const item = await runsService.getRun(
      {
        userId: authContext.localUserId,
        email: authContext.email
      },
      request.params.runId
    );
    return { item };
  });

  app.post("/runs", async (request, reply) => {
    const authContext = requireAuthContext(request.authContext);
    const input = simulateRunInputSchema.parse(request.body);
    const item = await runsService.enqueueRun(
      {
        userId: authContext.localUserId,
        email: authContext.email
      },
      input.jobId
    );
    return reply.status(201).send({ item });
  });
}
