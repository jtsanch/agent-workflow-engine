import type { FastifyInstance } from "fastify";
import { createJobInputSchema } from "@personal-agent-os/shared";
import { requireAuthContext } from "../../common/auth-middleware.js";
import type { JobsService } from "../../services/jobs-service.js";

export function registerJobsController(app: FastifyInstance, jobsService: JobsService): void {
  app.get("/jobs", async (request) => {
    const authContext = requireAuthContext(request.authContext);
    const items = await jobsService.listJobs({
      userId: authContext.localUserId,
      email: authContext.email
    });
    return { items };
  });

  app.post("/jobs", async (request, reply) => {
    const authContext = requireAuthContext(request.authContext);
    const input = createJobInputSchema.parse(request.body);
    const item = await jobsService.createJob(input, {
      userId: authContext.localUserId,
      email: authContext.email
    });
    return reply.status(201).send({ item });
  });
}
