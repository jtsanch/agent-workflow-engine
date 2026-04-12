import type { FeedbackEvent } from "@personal-agent-os/shared";
import type { PostgresDatabase } from "../../db/database.js";
import { feedbackEventsTable } from "../../db/schema/index.js";
import { BaseRepository } from "../base-repository.js";
import type { FeedbackEventRepository } from "../interfaces.js";

export class PostgresFeedbackEventRepository extends BaseRepository implements FeedbackEventRepository {
  constructor(db: PostgresDatabase) {
    super(db);
  }

  async create(event: FeedbackEvent): Promise<FeedbackEvent> {
    return this.exec("feedback_events.create", async () => {
      await this.db.insert(feedbackEventsTable).values({
        id: event.id,
        jobId: event.jobId,
        jobRunId: event.jobRunId ?? null,
        score: String(event.score),
        comment: event.comment ?? null,
        createdAt: new Date(event.createdAt)
      });
      return event;
    });
  }
}
