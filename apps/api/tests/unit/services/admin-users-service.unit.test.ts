import { describe, expect, it, vi } from "vitest";
import type { UserRecord } from "../../../src/db/database.js";
import type { UserRepository } from "../../../src/repositories/interfaces.js";
import { AdminUsersService } from "../../../src/services/admin-users-service.js";
import type { UserUsageReader } from "../../../src/services/user-usage-service.js";

const users: UserRecord[] = [
  {
    id: "admin-id",
    email: "admin@example.com",
    firstName: "Admin",
    lastName: "User",
    clerkUserId: "clerk_admin",
    status: "active",
    role: "admin",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z"
  },
  {
    id: "user-id",
    email: "user@example.com",
    firstName: "Demo",
    lastName: "User",
    clerkUserId: "clerk_user",
    status: "disabled",
    role: "user",
    createdAt: "2026-05-02T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z"
  }
];

function createRepository(): UserRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByClerkUserId: vi.fn(),
    listAll: vi.fn(),
    updateStatus: vi.fn()
  };
}

function createUsageReader(): UserUsageReader {
  return {
    getSummary: vi.fn(async (userId: string) => ({
      dailyUsed: userId === "admin-id" ? 10 : 20,
      dailyLimit: 60000,
      monthlyUsed: userId === "admin-id" ? 100 : 200,
      monthlyLimit: 300000,
      perRunLimit: 12000
    })),
    listEvents: vi.fn()
  };
}

describe("AdminUsersService", () => {
  it("lists paginated users with usage summaries", async () => {
    const repository = createRepository();
    const usageReader = createUsageReader();
    vi.mocked(repository.listAll).mockResolvedValue(users);

    const service = new AdminUsersService(repository, usageReader);

    await expect(service.listUsers(undefined, 1)).resolves.toEqual({
      users: [
        {
          id: "admin-id",
          email: "admin@example.com",
          firstName: "Admin",
          lastName: "User",
          status: "active",
          role: "admin",
          usage: {
            dailyUsed: 10,
            dailyLimit: 60000,
            monthlyUsed: 100,
            monthlyLimit: 300000,
            perRunLimit: 12000
          }
        }
      ],
      nextCursor: "admin-id"
    });
  });

  it("uses the cursor to return the next page", async () => {
    const repository = createRepository();
    const usageReader = createUsageReader();
    vi.mocked(repository.listAll).mockResolvedValue(users);

    const service = new AdminUsersService(repository, usageReader);

    await expect(service.listUsers("admin-id", 1)).resolves.toEqual({
      users: [
        {
          id: "user-id",
          email: "user@example.com",
          firstName: "Demo",
          lastName: "User",
          status: "disabled",
          role: "user",
          usage: {
            dailyUsed: 20,
            dailyLimit: 60000,
            monthlyUsed: 200,
            monthlyLimit: 300000,
            perRunLimit: 12000
          }
        }
      ],
      nextCursor: undefined
    });
  });

  it("disables and enables users after verifying they exist", async () => {
    const repository = createRepository();
    const usageReader = createUsageReader();
    vi.mocked(repository.findById).mockResolvedValue(users[0]);

    const service = new AdminUsersService(repository, usageReader);

    await service.disableUser("admin-id");
    await service.enableUser("admin-id");

    expect(repository.updateStatus).toHaveBeenNthCalledWith(1, "admin-id", "disabled");
    expect(repository.updateStatus).toHaveBeenNthCalledWith(2, "admin-id", "active");
  });

  it("throws when attempting to update an unknown user", async () => {
    const repository = createRepository();
    const usageReader = createUsageReader();
    vi.mocked(repository.findById).mockResolvedValue(null);

    const service = new AdminUsersService(repository, usageReader);

    await expect(service.disableUser("missing-user")).rejects.toMatchObject({
      message: "Unknown user: missing-user",
      statusCode: 404,
      code: "user_not_found"
    });
  });
});
