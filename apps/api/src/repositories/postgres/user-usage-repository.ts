import { and, desc, eq, lt, or } from "drizzle-orm";
import type { PostgresDatabase } from "../../db/database.js";
import {
  userLlmUsageLimitsTable,
  userUsageCountersTable,
  usageEventsTable
} from "../../db/schema/index.js";
import { BaseRepository } from "../base-repository.js";
import type {
  UsageCounterRecord,
  UsageEventRecord,
  UsageEventPageRecord,
  UsageSummaryRecord,
  UserUsageRepository
} from "../interfaces.js";

export class PostgresUserUsageRepository extends BaseRepository implements UserUsageRepository {
  constructor(db: PostgresDatabase) {
    super(db);
  }

  async findSummaryByUserId(userId: string): Promise<UsageSummaryRecord | null> {
    return this.exec("user_usage.find_summary_by_user_id", async () => {
      const [row] = await this.db
        .select({
          dailyUsed: userUsageCountersTable.dailyTokens,
          monthlyUsed: userUsageCountersTable.monthlyTokens,
          perRunLimit: userLlmUsageLimitsTable.perRunTokenLimit,
          dailyLimit: userLlmUsageLimitsTable.dailyTokenLimit,
          monthlyLimit: userLlmUsageLimitsTable.monthlyTokenLimit
        })
        .from(userUsageCountersTable)
        .innerJoin(userLlmUsageLimitsTable, eq(userUsageCountersTable.userId, userLlmUsageLimitsTable.userId))
        .where(eq(userUsageCountersTable.userId, userId))
        .limit(1);

      if (!row) {
        return null;
      }

      return {
        dailyUsed: row.dailyUsed,
        dailyLimit: row.dailyLimit,
        perRunLimit: row.perRunLimit,
        monthlyUsed: row.monthlyUsed,
        monthlyLimit: row.monthlyLimit
      };
    });
  }

  async findCountersByUserId(userId: string): Promise<UsageCounterRecord | null> {
    return this.exec("user_usage.find_counters_by_user_id", async () => {
      const [row] = await this.db
        .select({
          dailyTokens: userUsageCountersTable.dailyTokens,
          monthlyTokens: userUsageCountersTable.monthlyTokens,
          lastDailyReset: userUsageCountersTable.lastDailyReset,
          lastMonthlyReset: userUsageCountersTable.lastMonthlyReset
        })
        .from(userUsageCountersTable)
        .where(eq(userUsageCountersTable.userId, userId))
        .limit(1);

      if (!row) {
        return null;
      }

      return {
        dailyTokens: row.dailyTokens,
        monthlyTokens: row.monthlyTokens,
        lastDailyReset: row.lastDailyReset.toISOString(),
        lastMonthlyReset: row.lastMonthlyReset.toISOString()
      };
    });
  }

  async updateCounters(userId: string, counters: UsageCounterRecord): Promise<void> {
    await this.exec("user_usage.update_counters", async () => {
      await this.db
        .update(userUsageCountersTable)
        .set({
          dailyTokens: counters.dailyTokens,
          monthlyTokens: counters.monthlyTokens,
          lastDailyReset: new Date(counters.lastDailyReset),
          lastMonthlyReset: new Date(counters.lastMonthlyReset)
        })
        .where(eq(userUsageCountersTable.userId, userId));
    });
  }

  async createEvent(event: UsageEventRecord): Promise<UsageEventRecord> {
    return this.exec("user_usage.create_event", async () => {
      await this.db.insert(usageEventsTable).values({
        id: event.id,
        userId: event.userId,
        jobId: event.jobId ?? null,
        jobRunId: event.jobRunId ?? null,
        model: event.model,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
        totalTokens: event.totalTokens,
        createdAt: new Date(event.createdAt)
      });

      return event;
    });
  }

  async listEventsByUserId(userId: string, cursor?: string, limit?: number): Promise<UsageEventPageRecord> {
    return this.exec("user_usage.list_events_by_user_id", async () => {
      const pageSize = limit ? limit + 1 : undefined;
      let cursorRow:
        | {
            id: string;
            createdAt: Date;
          }
        | undefined;

      if (cursor) {
        const [row] = await this.db
          .select({
            id: usageEventsTable.id,
            createdAt: usageEventsTable.createdAt
          })
          .from(usageEventsTable)
          .where(and(eq(usageEventsTable.userId, userId), eq(usageEventsTable.id, cursor)))
          .limit(1);

        if (!row) {
          return { events: [] };
        }

        cursorRow = row;
      }

      const rows = await this.db
        .select({
          id: usageEventsTable.id,
          userId: usageEventsTable.userId,
          jobId: usageEventsTable.jobId,
          jobRunId: usageEventsTable.jobRunId,
          model: usageEventsTable.model,
          promptTokens: usageEventsTable.promptTokens,
          completionTokens: usageEventsTable.completionTokens,
          totalTokens: usageEventsTable.totalTokens,
          createdAt: usageEventsTable.createdAt
        })
        .from(usageEventsTable)
        .where(
          cursorRow
            ? and(
                eq(usageEventsTable.userId, userId),
                or(
                  lt(usageEventsTable.createdAt, cursorRow.createdAt),
                  and(eq(usageEventsTable.createdAt, cursorRow.createdAt), lt(usageEventsTable.id, cursorRow.id))
                )
              )
            : eq(usageEventsTable.userId, userId)
        )
        .orderBy(desc(usageEventsTable.createdAt), desc(usageEventsTable.id))
        .limit(pageSize ?? Number.MAX_SAFE_INTEGER);

      const hasNextPage = limit !== undefined && rows.length > limit;
      const pageRows = hasNextPage ? rows.slice(0, limit) : rows;

      return {
        events: pageRows.map((row) => ({
          id: row.id,
          userId: row.userId,
          jobId: row.jobId ?? undefined,
          jobRunId: row.jobRunId ?? undefined,
          model: row.model,
          promptTokens: row.promptTokens,
          completionTokens: row.completionTokens,
          totalTokens: row.totalTokens,
          createdAt: row.createdAt.toISOString()
        })),
        nextCursor: hasNextPage ? pageRows[pageRows.length - 1]?.id : undefined
      };
    });
  }
}
