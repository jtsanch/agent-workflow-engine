import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { UserRecord } from "../db/database.js";
import type { PostgresDatabase } from "../db/database.js";
import {
  userLlmUsageLimitsTable,
  userUsageCountersTable,
  usersTable
} from "../db/schema/index.js";

const DAILY_TOKEN_LIMIT = 60000;
const MONTHLY_TOKEN_LIMIT = 300000;
const PER_RUN_TOKEN_LIMIT = 12000;

export interface BootstrapUserInput {
  clerkUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  now: string;
}

function mapUserRow(row: typeof usersTable.$inferSelect): UserRecord {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    clerkUserId: row.clerkUserId,
    status: row.status as UserRecord["status"],
    role: row.role as UserRecord["role"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString()
  };
}

export class UserBootstrapService {
  constructor(private readonly database: PostgresDatabase) {}

  async bootstrapUser(input: BootstrapUserInput): Promise<UserRecord> {
    return this.database.db.transaction(async (tx) => {
      const [existingUser] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.clerkUserId, input.clerkUserId))
        .limit(1);

      if (existingUser) {
        return mapUserRow(existingUser);
      }

      const [firstExistingUser] = await tx.select({ id: usersTable.id }).from(usersTable).limit(1);
      const role: UserRecord["role"] = firstExistingUser ? "user" : "admin";
      const status: UserRecord["status"] = firstExistingUser ? "disabled" : "active";
      const userId = randomUUID();
      const now = new Date(input.now);

      await tx.insert(usersTable).values({
        id: userId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        clerkUserId: input.clerkUserId,
        status,
        role,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now
      });

      await tx.insert(userLlmUsageLimitsTable).values({
        userId,
        dailyTokenLimit: DAILY_TOKEN_LIMIT,
        monthlyTokenLimit: MONTHLY_TOKEN_LIMIT,
        perRunTokenLimit: PER_RUN_TOKEN_LIMIT,
        createdAt: now,
        updatedAt: now
      });

      await tx.insert(userUsageCountersTable).values({
        userId,
        dailyTokens: 0,
        monthlyTokens: 0,
        lastDailyReset: now,
        lastMonthlyReset: now
      });

      return {
        id: userId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        clerkUserId: input.clerkUserId,
        status,
        role,
        createdAt: input.now,
        updatedAt: input.now,
        lastLoginAt: input.now
      };
    });
  }
}
