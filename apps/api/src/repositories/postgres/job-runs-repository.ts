import { desc, eq } from "drizzle-orm";
import type { JobRun } from "@personal-agent-os/shared";
import type { PostgresDatabase } from "../../db/database.js";
import { jobsTable, jobRunsTable } from "../../db/schema/index.js";
import { BaseRepository } from "../base-repository.js";
import type { JobRunRepository } from "../interfaces.js";
import { mapJobRun } from "./mappers.js";

export class PostgresJobRunRepository extends BaseRepository implements JobRunRepository {
  constructor(db: PostgresDatabase) {
    super(db);
  }

  async listByUser(userId: string): Promise<JobRun[]> {
    return this.exec("job_runs.list_by_user", async () => {
      const rows = await this.db
        .select({ run: jobRunsTable })
        .from(jobRunsTable)
        .innerJoin(jobsTable, eq(jobsTable.id, jobRunsTable.jobId))
        .where(eq(jobsTable.userId, userId))
        .orderBy(desc(jobRunsTable.startedAt));
      return rows.map(({ run }: { run: unknown }) => mapJobRun(run as Record<string, unknown>));
    });
  }

  async findById(jobRunId: string): Promise<JobRun | null> {
    return this.exec("job_runs.find_by_id", async () => {
      const [row] = await this.db.select().from(jobRunsTable).where(eq(jobRunsTable.id, jobRunId)).limit(1);
      return row ? mapJobRun(row as Record<string, unknown>) : null;
    });
  }

  async create(run: JobRun): Promise<JobRun> {
    return this.exec("job_runs.create", async () => {
      await this.db.insert(jobRunsTable).values({
        id: run.id,
        jobId: run.jobId,
        status: run.status,
        triggerSource: run.triggerSource,
        startedAt: new Date(run.startedAt),
        completedAt: run.completedAt ? new Date(run.completedAt) : null,
        output: run.output ?? null,
        errorMessage: run.errorMessage ?? null
      });
      return run;
    });
  }

  async update(run: JobRun): Promise<JobRun> {
    return this.exec("job_runs.update", async () => {
      await this.db
        .update(jobRunsTable)
        .set({
          status: run.status,
          completedAt: run.completedAt ? new Date(run.completedAt) : null,
          output: run.output ?? null,
          errorMessage: run.errorMessage ?? null
        })
        .where(eq(jobRunsTable.id, run.id));
      return run;
    });
  }
}
