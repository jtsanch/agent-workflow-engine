import { describe, expect, it } from "vitest";
import type {
  UsageCounterRecord,
  UsageEventPageRecord,
  UsageEventRecord,
  UsageSummaryRecord,
  UserUsageRepository
} from "../../../src/repositories/interfaces.js";
import { UserUsageService } from "../../../src/services/user-usage-service.js";

class TestUserUsageRepository implements UserUsageRepository {
  eventPage: UsageEventPageRecord = { events: [] };

  constructor(private readonly summary: UsageSummaryRecord | null) {}

  async findSummaryByUserId(): Promise<UsageSummaryRecord | null> {
    return this.summary;
  }

  async findCountersByUserId(): Promise<UsageCounterRecord | null> {
    throw new Error("not used");
  }

  async updateCounters() {
    throw new Error("not used");
  }

  async createEvent(event: UsageEventRecord): Promise<UsageEventRecord> {
    return event;
  }

  async listEventsByUserId(): Promise<UsageEventPageRecord> {
    return this.eventPage;
  }
}

describe("UserUsageService", () => {
  it("returns usage summary from counters and limits", async () => {
    const service = new UserUsageService(
      new TestUserUsageRepository({
        dailyUsed: 1200,
        dailyLimit: 60000,
        monthlyUsed: 5400,
        monthlyLimit: 300000,
        perRunLimit: 12000
      })
    );

    await expect(service.getSummary("user-id")).resolves.toEqual({
      dailyUsed: 1200,
      dailyLimit: 60000,
      monthlyUsed: 5400,
      monthlyLimit: 300000,
      perRunLimit: 12000
    });
  });

  it("maps usage event pages into the API response shape", async () => {
    const repository = new TestUserUsageRepository(null);
    repository.eventPage = {
      events: [
        {
          id: "event_1",
          userId: "user-id",
          jobId: "job_1",
          jobRunId: "run_1",
          model: "gpt-4.1-mini",
          promptTokens: 50,
          completionTokens: 20,
          totalTokens: 70,
          createdAt: "2026-05-02T00:00:00.000Z"
        }
      ],
      nextCursor: "event_1"
    };

    const service = new UserUsageService(repository);

    await expect(service.listEvents("user-id", "cursor_1", 1)).resolves.toEqual({
      events: [
        {
          id: "event_1",
          jobId: "job_1",
          jobRunId: "run_1",
          model: "gpt-4.1-mini",
          promptTokens: 50,
          completionTokens: 20,
          totalTokens: 70,
          createdAt: "2026-05-02T00:00:00.000Z"
        }
      ],
      nextCursor: "event_1"
    });
  });
});
