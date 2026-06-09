import { desc, eq } from "drizzle-orm";
import type { AlertPreference, Job, JobSchedule } from "@personal-agent-os/shared";
import type { PostgresDatabase } from "../../db/database.js";
import { jobAlertPreferencesTable, jobSchedulesTable, jobsTable } from "../../db/schema/index.js";
import { BaseRepository } from "../base-repository.js";
import type { JobRepository } from "../interfaces.js";
import { mapJob } from "./mappers.js";

export class PostgresJobRepository extends BaseRepository implements JobRepository {
  constructor(db: PostgresDatabase) {
    super(db);
  }

  async listByUser(userId: string): Promise<Job[]> {
    return this.exec("jobs.list_by_user", async () => {
      const rows = await this.db.select().from(jobsTable).where(eq(jobsTable.userId, userId)).orderBy(desc(jobsTable.createdAt));
      return rows.map((row: unknown) => mapJob(row as Record<string, unknown>));
    });
  }

  async findById(jobId: string): Promise<Job | null> {
    return this.exec("jobs.find_by_id", async () => {
      const [row] = await this.db.select().from(jobsTable).where(eq(jobsTable.id, jobId)).limit(1);
      return row ? mapJob(row as Record<string, unknown>) : null;
    });
  }

  async create(job: Job): Promise<Job> {
    return this.exec("jobs.create", async () => {
      await this.db.insert(jobsTable).values({
        id: job.id,
        userId: job.userId,
        agentDefinitionKey: job.agentDefinitionKey ?? null,
        dagId: job.dagId,
        name: job.name,
        status: job.status,
        input: job.inputs,
        inputs: job.inputs,
        createdAt: new Date(job.createdAt),
        updatedAt: new Date(job.updatedAt)
      });
      return job;
    });
  }

  async createWithRelations(job: Job, schedule: JobSchedule, alertPreferences: AlertPreference[]): Promise<Job> {
    return this.exec("jobs.create_with_relations", async () => {
      await this.db.transaction(async (tx) => {
        await tx.insert(jobsTable).values({
          id: job.id,
          userId: job.userId,
          agentDefinitionKey: job.agentDefinitionKey ?? null,
          dagId: job.dagId,
          name: job.name,
          status: job.status,
          input: job.inputs,
          inputs: job.inputs,
          createdAt: new Date(job.createdAt),
          updatedAt: new Date(job.updatedAt)
        });

        await tx.insert(jobSchedulesTable).values({
          id: schedule.id,
          jobId: schedule.jobId,
          scheduleExpression: schedule.scheduleExpression,
          timezone: schedule.timezone,
          enabled: schedule.enabled,
          createdAt: new Date(schedule.createdAt),
          updatedAt: new Date(schedule.updatedAt)
        });

        if (alertPreferences.length > 0) {
          await tx.insert(jobAlertPreferencesTable).values(
            alertPreferences.map((preference) => ({
              id: preference.id,
              jobId: preference.jobId,
              channel: preference.channel,
              destination: preference.destination,
              onSuccess: preference.onSuccess,
              onFailure: preference.onFailure
            }))
          );
        }
      });

      return job;
    });
  }
}
