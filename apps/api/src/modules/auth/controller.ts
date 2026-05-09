import type { FastifyInstance } from "fastify";
import { requireAuthContext } from "../../common/auth-middleware.js";
import { AppError } from "../../common/errors.js";
import type { UserService } from "../../services/user-service.js";
import type { UserUsageReader } from "../../services/user-usage-service.js";

export function registerAuthController(
  app: FastifyInstance,
  userService: UserService | null,
  userUsageService: UserUsageReader | null
): void {
  app.get("/auth/me", async (request) => {
    const authContext = requireAuthContext(request.authContext);

    if (!userService) {
      throw new AppError("User state not found", 500, "user_state_not_found");
    }

    if (!userUsageService) {
      throw new AppError("Usage state not found", 500, "usage_state_not_found");
    }

    const user = await userService.getRequiredById(authContext.localUserId);
    const usage = await userUsageService.getSummary(authContext.localUserId);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        role: user.role
      },
      usage
    };
  });
}
