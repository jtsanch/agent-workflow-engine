import { AppError } from "../common/errors.js";
import type {
  UsageEventPageRecord,
  UsageSummaryRecord,
  UserUsageRepository
} from "../repositories/interfaces.js";

export interface UserUsageReader {
  getSummary(userId: string): Promise<UsageSummaryRecord>;
  listEvents(userId: string, cursor?: string, limit?: number): Promise<UsageEventListResult>;
}

export interface UsageEventListItem {
  id: string;
  jobId?: string;
  jobRunId?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  createdAt: string;
}

export interface UsageEventListResult {
  events: UsageEventListItem[];
  nextCursor?: string;
}

export class UserUsageService implements UserUsageReader {
  constructor(private readonly userUsageRepository: UserUsageRepository) {}

  async getSummary(userId: string): Promise<UsageSummaryRecord> {
    const summary = await this.userUsageRepository.findSummaryByUserId(userId);
    if (!summary) {
      throw new AppError("Usage state not found", 500, "usage_state_not_found");
    }

    return summary;
  }

  async listEvents(userId: string, cursor?: string, limit?: number): Promise<UsageEventListResult> {
    const page = await this.userUsageRepository.listEventsByUserId(userId, cursor, limit);
    return this.toUsageEventList(page);
  }

  private toUsageEventList(page: UsageEventPageRecord): UsageEventListResult {
    return {
      events: page.events.map((event) => ({
        id: event.id,
        jobId: event.jobId,
        jobRunId: event.jobRunId,
        model: event.model,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
        totalTokens: event.totalTokens,
        createdAt: event.createdAt
      })),
      nextCursor: page.nextCursor
    };
  }
}
