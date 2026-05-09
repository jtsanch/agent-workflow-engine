import { randomUUID } from "node:crypto";
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

export class UserBootstrapService {
  constructor(private readonly database: PostgresDatabase) {}

  async bootstrapUser(input: BootstrapUserInput): Promise<UserRecord> {
    return this.database.db.transaction(async (tx) => {
      const existingUser = await tx.query.usersTable.findFirst({
        where: (users, { eq }) => eq(users.clerkUserId, input.clerkUserId)
      });

      if (existingUser) {
        return {
          id: existingUser.id,
          email: existingUser.email,
          firstName: existingUser.firstName ?? null,
          lastName: existingUser.lastName ?? null,
          clerkUserId: existingUser.clerkUserId,
          status: existingUser.status as UserRecord["status"],
          role: existingUser.role as UserRecord["role"],
          createdAt: existingUser.createdAt.toISOString(),
          updatedAt: existingUser.updatedAt.toISOString(),
          lastLoginAt: existingUser.lastLoginAt?.toISOString()
        };
      }

      const firstExistingUser = await tx.query.usersTable.findFirst();
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
