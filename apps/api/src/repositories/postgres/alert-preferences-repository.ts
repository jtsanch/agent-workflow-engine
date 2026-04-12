import { eq } from "drizzle-orm";
import type { AlertPreference } from "@personal-agent-os/shared";
import type { PostgresDatabase } from "../../db/database.js";
import { jobAlertPreferencesTable } from "../../db/schema/index.js";
import { BaseRepository } from "../base-repository.js";
import type { AlertPreferenceRepository } from "../interfaces.js";
import { mapAlertPreference } from "./mappers.js";

export class PostgresAlertPreferenceRepository extends BaseRepository implements AlertPreferenceRepository {
  constructor(db: PostgresDatabase) {
    super(db);
  }

  async listByJobId(jobId: string): Promise<AlertPreference[]> {
    return this.exec("job_alert_preferences.list_by_job_id", async () => {
      const rows = await this.db.select().from(jobAlertPreferencesTable).where(eq(jobAlertPreferencesTable.jobId, jobId));
      return rows.map((row: unknown) => mapAlertPreference(row as Record<string, unknown>));
    });
  }

  async createMany(preferences: AlertPreference[]): Promise<AlertPreference[]> {
    return this.exec("job_alert_preferences.create_many", async () => {
      for (const preference of preferences) {
        await this.db.insert(jobAlertPreferencesTable).values({
          id: preference.id,
          jobId: preference.jobId ?? "",
          channel: preference.channel,
          destination: preference.destination,
          onSuccess: preference.onSuccess,
          onFailure: preference.onFailure
        });
      }
      return preferences;
    });
  }
}
