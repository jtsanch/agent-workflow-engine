import type { FastifyInstance } from "fastify";
import { createJobInputSchema } from "@personal-agent-os/shared";
import type { JobsService } from "../../services/jobs-service.js";
import { getUserContext } from "../../stub-user-context.js";

export function registerJobsController(app: FastifyInstance, jobsService: JobsService): void {
  app.get("/jobs", async () => {
    const items = await jobsService.listJobs(getUserContext());
    return { items };
  });

  app.post("/jobs", async (request, reply) => {
    const input = createJobInputSchema.parse(request.body);
    const item = await jobsService.createJob(input, getUserContext());
    return reply.status(201).send({ item });
  });
}
