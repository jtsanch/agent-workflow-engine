import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdminRole } from "../../common/access-control.js";
import { requireAuthContext } from "../../common/auth-middleware.js";
import { AppError } from "../../common/errors.js";

const adminUsersQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().optional()
});

interface AdminUsersHandler {
  listUsers(cursor?: string, limit?: number): Promise<{
    users: Array<{
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      status: "active" | "disabled";
      role: "admin" | "user";
      usage: {
        dailyUsed: number;
        dailyLimit: number;
        monthlyUsed: number;
        monthlyLimit: number;
        perRunLimit: number;
      };
    }>;
    nextCursor?: string;
  }>;
  disableUser(userId: string): Promise<void>;
  enableUser(userId: string): Promise<void>;
}

export function registerAdminController(app: FastifyInstance, adminUsersService: AdminUsersHandler | null): void {
  app.get<{ Querystring: { cursor?: string; limit?: string | number } }>("/admin/users", async (request) => {
    requireAdminRole(requireAuthContext(request.authContext));

    if (!adminUsersService) {
      throw new AppError("Usage state not found", 500, "usage_state_not_found");
    }

    const query = adminUsersQuerySchema.parse(request.query);
    return adminUsersService.listUsers(query.cursor, query.limit);
  });

  app.post<{ Params: { id: string } }>("/admin/users/:id/disable", async (request, reply) => {
    requireAdminRole(requireAuthContext(request.authContext));

    if (!adminUsersService) {
      throw new AppError("Usage state not found", 500, "usage_state_not_found");
    }

    await adminUsersService.disableUser(request.params.id);
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>("/admin/users/:id/enable", async (request, reply) => {
    requireAdminRole(requireAuthContext(request.authContext));

    if (!adminUsersService) {
      throw new AppError("Usage state not found", 500, "usage_state_not_found");
    }

    await adminUsersService.enableUser(request.params.id);
    return reply.status(204).send();
  });
}
