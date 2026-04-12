import { asc, eq } from "drizzle-orm";
import type { JobRunStep } from "@personal-agent-os/shared";
import type { PostgresDatabase } from "../../db/database.js";
import { jobRunStepsTable } from "../../db/schema/index.js";
import { BaseRepository } from "../base-repository.js";
import type { JobRunStepRepository } from "../interfaces.js";
import { mapJobRunStep } from "./mappers.js";

export class PostgresJobRunStepRepository extends BaseRepository implements JobRunStepRepository {
  constructor(db: PostgresDatabase) {
    super(db);
  }

  async listByRunId(jobRunId: string): Promise<JobRunStep[]> {
    return this.exec("job_run_steps.list_by_run_id", async () => {
      const rows = await this.db
        .select()
        .from(jobRunStepsTable)
        .where(eq(jobRunStepsTable.jobRunId, jobRunId))
        .orderBy(asc(jobRunStepsTable.startedAt));
      return rows.map((row: unknown) => mapJobRunStep(row as Record<string, unknown>));
    });
  }

  async createMany(steps: JobRunStep[]): Promise<JobRunStep[]> {
    return this.exec("job_run_steps.create_many", async () => {
      for (const step of steps) {
        await this.db.insert(jobRunStepsTable).values({
          id: step.id,
          jobRunId: step.jobRunId,
          name: step.name,
          status: step.status,
          startedAt: new Date(step.startedAt),
          completedAt: step.completedAt ? new Date(step.completedAt) : null,
          detail: step.detail ?? null
        });
      }
      return steps;
    });
  }
}
