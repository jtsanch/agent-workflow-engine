import { eq } from "drizzle-orm";
import type { JobSchedule } from "@personal-agent-os/shared";
import type { PostgresDatabase } from "../../db/database.js";
import { jobSchedulesTable } from "../../db/schema/index.js";
import { BaseRepository } from "../base-repository.js";
import type { JobScheduleRepository } from "../interfaces.js";
import { mapJobSchedule } from "./mappers.js";

export class PostgresJobScheduleRepository extends BaseRepository implements JobScheduleRepository {
  constructor(db: PostgresDatabase) {
    super(db);
  }

  async findByJobId(jobId: string): Promise<JobSchedule | null> {
    return this.exec("job_schedules.find_by_job_id", async () => {
      const [row] = await this.db.select().from(jobSchedulesTable).where(eq(jobSchedulesTable.jobId, jobId)).limit(1);
      return row ? mapJobSchedule(row as Record<string, unknown>) : null;
    });
  }

  async create(schedule: JobSchedule): Promise<JobSchedule> {
    return this.exec("job_schedules.create", async () => {
      await this.db.insert(jobSchedulesTable).values({
        id: schedule.id,
        jobId: schedule.jobId,
        scheduleExpression: schedule.scheduleExpression,
        timezone: schedule.timezone,
        enabled: schedule.enabled,
        createdAt: new Date(schedule.createdAt),
        updatedAt: new Date(schedule.updatedAt)
      });
      return schedule;
    });
  }
}
