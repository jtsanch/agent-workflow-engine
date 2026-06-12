import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRecord } from "../../../src/db/database.js";
import { userLlmUsageLimitsTable, userUsageCountersTable, usersTable } from "../../../src/db/schema/index.js";
import { UserBootstrapService } from "../../../src/services/user-bootstrap-service.js";

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "new-user-id")
}));

type ExistingDbUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  clerkUserId: string;
  status: "active" | "disabled";
  role: "admin" | "user";
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date | null;
};

function createDatabase(findFirstResults: Array<ExistingDbUser | null>) {
  const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const select = vi.fn();
  for (const result of findFirstResults) {
    select.mockImplementationOnce(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => (result ? [result] : []))
        })),
        limit: vi.fn(async () => (result ? [result] : []))
      }))
    }));
  }

  const tx = {
    select,
    insert: vi.fn((table: unknown) => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        inserted.push({ table, values });
      })
    }))
  };

  return {
    inserted,
    transaction: vi.fn(async (callback: (txArg: typeof tx) => Promise<UserRecord>) => callback(tx))
  };
}

describe("UserBootstrapService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an existing user without inserting new records", async () => {
    const existingUser = {
      id: "existing-user-id",
      email: "existing@example.com",
      firstName: "Existing",
      lastName: "User",
      clerkUserId: "clerk_existing",
      status: "active" as const,
      role: "user" as const,
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      updatedAt: new Date("2026-05-02T00:00:00.000Z"),
      lastLoginAt: new Date("2026-05-03T00:00:00.000Z")
    };
    const database = createDatabase([existingUser]);
    const service = new UserBootstrapService({
      db: {
        transaction: database.transaction
      }
    } as never);

    await expect(
      service.bootstrapUser({
        clerkUserId: "clerk_existing",
        email: "existing@example.com",
        firstName: "Existing",
        lastName: "User",
        now: "2026-05-10T00:00:00.000Z"
      })
    ).resolves.toEqual({
      id: "existing-user-id",
      email: "existing@example.com",
      firstName: "Existing",
      lastName: "User",
      clerkUserId: "clerk_existing",
      status: "active",
      role: "user",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-02T00:00:00.000Z",
      lastLoginAt: "2026-05-03T00:00:00.000Z"
    });
    expect(database.inserted).toEqual([]);
  });

  it("creates an initial admin user with active status and seeded usage state", async () => {
    const database = createDatabase([null, null]);
    const service = new UserBootstrapService({
      db: {
        transaction: database.transaction
      }
    } as never);

    await expect(
      service.bootstrapUser({
        clerkUserId: "clerk_first",
        email: "first@example.com",
        firstName: "First",
        lastName: "Admin",
        now: "2026-05-10T00:00:00.000Z"
      })
    ).resolves.toEqual({
      id: "new-user-id",
      email: "first@example.com",
      firstName: "First",
      lastName: "Admin",
      clerkUserId: "clerk_first",
      status: "active",
      role: "admin",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
      lastLoginAt: "2026-05-10T00:00:00.000Z"
    });
    expect(database.inserted).toHaveLength(3);
    expect(database.inserted[0]).toEqual({
      table: usersTable,
      values: expect.objectContaining({
        id: "new-user-id",
        email: "first@example.com",
        status: "active",
        role: "admin"
      })
    });
    expect(database.inserted[1]).toEqual({
      table: userLlmUsageLimitsTable,
      values: expect.objectContaining({
        userId: "new-user-id",
        dailyTokenLimit: 60000,
        monthlyTokenLimit: 300000,
        perRunTokenLimit: 12000
      })
    });
    expect(database.inserted[2]).toEqual({
      table: userUsageCountersTable,
      values: expect.objectContaining({
        userId: "new-user-id",
        dailyTokens: 0,
        monthlyTokens: 0
      })
    });
  });

  it("creates subsequent users as disabled non-admin accounts", async () => {
    const database = createDatabase([
      null,
      {
        id: "existing-admin-id",
        email: "admin@example.com",
        firstName: "Admin",
        lastName: "User",
        clerkUserId: "clerk_admin",
        status: "active",
        role: "admin",
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        lastLoginAt: null
      }
    ]);
    const service = new UserBootstrapService({
      db: {
        transaction: database.transaction
      }
    } as never);

    await service.bootstrapUser({
      clerkUserId: "clerk_next",
      email: "next@example.com",
      firstName: "Next",
      lastName: "User",
      now: "2026-05-10T00:00:00.000Z"
    });

    expect(database.inserted[0]).toEqual({
      table: usersTable,
      values: expect.objectContaining({
        id: "new-user-id",
        email: "next@example.com",
        status: "disabled",
        role: "user"
      })
    });
  });
});
