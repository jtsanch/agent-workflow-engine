import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuthContext } from "../../common/auth-middleware.js";
import { AppError } from "../../common/errors.js";
import type { UserUsageReader } from "../../services/user-usage-service.js";

const usageEventsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().optional()
});

export function registerUsageController(app: FastifyInstance, userUsageService: UserUsageReader | null): void {
  app.get("/usage/me", async (request) => {
    const authContext = requireAuthContext(request.authContext);

    if (!userUsageService) {
      throw new AppError("Usage state not found", 500, "usage_state_not_found");
    }

    return userUsageService.getSummary(authContext.localUserId);
  });

  app.get<{ Querystring: { cursor?: string; limit?: string | number } }>("/usage/me/events", async (request) => {
    const authContext = requireAuthContext(request.authContext);

    if (!userUsageService) {
      throw new AppError("Usage state not found", 500, "usage_state_not_found");
    }

    const query = usageEventsQuerySchema.parse(request.query);
    return userUsageService.listEvents(authContext.localUserId, query.cursor, query.limit);
  });
}
