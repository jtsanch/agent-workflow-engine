import { describe, expect, it, vi } from "vitest";
import type { ClerkRequestAuth } from "../../../src/common/types.js";
import { AuthContextService } from "../../../src/services/auth-context-service.js";
import type { UserBootstrapService } from "../../../src/services/user-bootstrap-service.js";
import type { UserService } from "../../../src/services/user-service.js";

const clerkAuth: ClerkRequestAuth = {
  clerkUserId: "clerk_user",
  email: "user@example.com",
  firstName: "Demo",
  lastName: "User"
};

describe("AuthContextService", () => {
  it("bootstraps a user through the resolver callback and returns auth context", async () => {
    const userService = {
      resolveLocalUser: vi.fn(async (_input, bootstrapUser) => bootstrapUser())
    } as unknown as UserService;
    const userBootstrapService = {
      bootstrapUser: vi.fn(async () => ({
        id: "user-id",
        email: "user@example.com",
        firstName: "Demo",
        lastName: "User",
        clerkUserId: "clerk_user",
        status: "active" as const,
        role: "admin" as const,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
        lastLoginAt: "2026-05-01T00:00:00.000Z"
      }))
    } as unknown as UserBootstrapService;

    const service = new AuthContextService(userService, userBootstrapService);

    await expect(service.authenticate(clerkAuth, "2026-05-10T01:00:00.000Z")).resolves.toEqual({
      clerkUserId: "clerk_user",
      localUserId: "user-id",
      role: "admin",
      email: "user@example.com"
    });
    expect(userService.resolveLocalUser).toHaveBeenCalledWith({ clerkUserId: "clerk_user" }, expect.any(Function));
    expect(userBootstrapService.bootstrapUser).toHaveBeenCalledWith({
      clerkUserId: "clerk_user",
      email: "user@example.com",
      firstName: "Demo",
      lastName: "User",
      now: "2026-05-10T01:00:00.000Z"
    });
  });

  it("rejects disabled users", async () => {
    const userService = {
      resolveLocalUser: vi.fn(async () => ({
        id: "user-id",
        email: "user@example.com",
        firstName: "Demo",
        lastName: "User",
        clerkUserId: "clerk_user",
        status: "disabled" as const,
        role: "user" as const,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      }))
    } as unknown as UserService;
    const userBootstrapService = {
      bootstrapUser: vi.fn()
    } as unknown as UserBootstrapService;

    const service = new AuthContextService(userService, userBootstrapService);

    await expect(service.authenticate(clerkAuth, "2026-05-10T01:00:00.000Z")).rejects.toMatchObject({
      message: "Your account is pending approval.",
      statusCode: 403,
      code: "forbidden"
    });
  });
});
