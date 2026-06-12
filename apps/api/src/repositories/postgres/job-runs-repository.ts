import { desc, eq } from "drizzle-orm";
import type { JobRun } from "@personal-agent-os/shared";
import type { PostgresDatabase } from "../../db/database.js";
import { jobsTable, jobRunsTable } from "../../db/schema/index.js";
import { BaseRepository } from "../base-repository.js";
import type { JobRunRepository } from "../interfaces.js";
import { mapJobRun } from "./mappers.js";
import { asNodeOutput } from "../sql-helpers.js";

type LeaseAwareJobRun = JobRun & {
  queuedAt?: string;
  claimedAt?: string;
  leaseExpiresAt?: string;
  lastHeartbeatAt?: string;
  claimedByWorkerId?: string;
};

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
      const leaseAwareRun = run as LeaseAwareJobRun;

      await this.db.insert(jobRunsTable).values({
        id: leaseAwareRun.id,
        jobId: leaseAwareRun.jobId,
        status: leaseAwareRun.status,
        triggerSource: leaseAwareRun.triggerSource,
        queuedAt: leaseAwareRun.queuedAt ? new Date(leaseAwareRun.queuedAt) : new Date(leaseAwareRun.startedAt),
        claimedAt: leaseAwareRun.claimedAt ? new Date(leaseAwareRun.claimedAt) : null,
        leaseExpiresAt: leaseAwareRun.leaseExpiresAt ? new Date(leaseAwareRun.leaseExpiresAt) : null,
        lastHeartbeatAt: leaseAwareRun.lastHeartbeatAt ? new Date(leaseAwareRun.lastHeartbeatAt) : null,
        claimedByWorkerId: leaseAwareRun.claimedByWorkerId ?? null,
        startedAt: new Date(leaseAwareRun.startedAt),
        completedAt: leaseAwareRun.completedAt ? new Date(leaseAwareRun.completedAt) : null,
        output: asNodeOutput(leaseAwareRun.output) ?? null,
        errorMessage: leaseAwareRun.errorMessage ?? null
      });
      return run;
    });
  }

  async update(run: JobRun): Promise<JobRun> {
    return this.exec("job_runs.update", async () => {
      const leaseAwareRun = run as LeaseAwareJobRun;

      await this.db
        .update(jobRunsTable)
        .set({
          status: leaseAwareRun.status,
          queuedAt: leaseAwareRun.queuedAt ? new Date(leaseAwareRun.queuedAt) : undefined,
          claimedAt: leaseAwareRun.claimedAt ? new Date(leaseAwareRun.claimedAt) : null,
          leaseExpiresAt: leaseAwareRun.leaseExpiresAt ? new Date(leaseAwareRun.leaseExpiresAt) : null,
          lastHeartbeatAt: leaseAwareRun.lastHeartbeatAt ? new Date(leaseAwareRun.lastHeartbeatAt) : null,
          claimedByWorkerId: leaseAwareRun.claimedByWorkerId ?? null,
          completedAt: leaseAwareRun.completedAt ? new Date(leaseAwareRun.completedAt) : null,
          output: asNodeOutput(leaseAwareRun.output) ?? null,
          errorMessage: leaseAwareRun.errorMessage ?? null
        })
        .where(eq(jobRunsTable.id, leaseAwareRun.id));
      return run;
    });
  }
}
