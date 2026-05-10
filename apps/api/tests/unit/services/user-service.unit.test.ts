import { describe, expect, it, vi } from "vitest";
import type { UserRecord } from "../../../src/db/database.js";
import type { UserRepository } from "../../../src/repositories/interfaces.js";
import { UserService } from "../../../src/services/user-service.js";

const userRecord: UserRecord = {
  id: "user-id",
  email: "user@example.com",
  firstName: "Demo",
  lastName: "User",
  clerkUserId: "clerk_user",
  status: "active",
  role: "user",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z"
};

function createRepository(): UserRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByClerkUserId: vi.fn(),
    listAll: vi.fn(),
    updateStatus: vi.fn()
  };
}

describe("UserService", () => {
  it("returns the required user when found", async () => {
    const repository = createRepository();
    vi.mocked(repository.findById).mockResolvedValue(userRecord);

    const service = new UserService(repository);

    await expect(service.getRequiredById("user-id")).resolves.toEqual(userRecord);
  });

  it("throws when the required user is missing", async () => {
    const repository = createRepository();
    vi.mocked(repository.findById).mockResolvedValue(null);

    const service = new UserService(repository);

    await expect(service.getRequiredById("missing-user")).rejects.toMatchObject({
      message: "Authenticated user not found",
      statusCode: 500,
      code: "authenticated_user_not_found"
    });
  });

  it("returns an existing local user without bootstrapping", async () => {
    const repository = createRepository();
    const bootstrapUser = vi.fn();
    vi.mocked(repository.findByClerkUserId).mockResolvedValue(userRecord);

    const service = new UserService(repository);

    await expect(service.resolveLocalUser({ clerkUserId: "clerk_user" }, bootstrapUser)).resolves.toEqual(
      userRecord
    );
    expect(bootstrapUser).not.toHaveBeenCalled();
  });

  it("bootstraps a user when no local user exists", async () => {
    const repository = createRepository();
    const bootstrapUser = vi.fn(async () => userRecord);
    vi.mocked(repository.findByClerkUserId).mockResolvedValue(null);

    const service = new UserService(repository);

    await expect(service.resolveLocalUser({ clerkUserId: "clerk_user" }, bootstrapUser)).resolves.toEqual(
      userRecord
    );
    expect(bootstrapUser).toHaveBeenCalledOnce();
  });
});
