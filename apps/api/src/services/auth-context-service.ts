import { AppError } from "../common/errors.js";
import type { AuthContext, ClerkRequestAuth } from "../common/types.js";
import { UserBootstrapService } from "./user-bootstrap-service.js";
import { UserService } from "./user-service.js";

export interface AuthContextAuthenticator {
  authenticate(clerkAuth: ClerkRequestAuth, now: string): Promise<AuthContext>;
}

export class AuthContextService implements AuthContextAuthenticator {
  constructor(
    private readonly userService: UserService,
    private readonly userBootstrapService: UserBootstrapService
  ) {}

  async authenticate(clerkAuth: ClerkRequestAuth, now: string): Promise<AuthContext> {
    const localUser = await this.userService.resolveLocalUser(
      {
        clerkUserId: clerkAuth.clerkUserId
      },
      () =>
        this.userBootstrapService.bootstrapUser({
          clerkUserId: clerkAuth.clerkUserId,
          email: clerkAuth.email,
          firstName: clerkAuth.firstName,
          lastName: clerkAuth.lastName,
          now
        })
    );

    if (localUser.status !== "active") {
      throw new AppError("Your account is pending approval.", 403, "forbidden");
    }

    return {
      clerkUserId: clerkAuth.clerkUserId,
      localUserId: localUser.id,
      role: localUser.role,
      email: localUser.email
    };
  }
}
