import { desc, eq } from "drizzle-orm";
import type { JobMemory } from "@personal-agent-os/shared";
import type { PostgresDatabase } from "../../db/database.js";
import { jobMemoriesTable } from "../../db/schema/index.js";
import { BaseRepository } from "../base-repository.js";
import type { JobMemoryRepository } from "../interfaces.js";
import { mapJobMemory } from "./mappers.js";

export class PostgresJobMemoryRepository extends BaseRepository implements JobMemoryRepository {
  constructor(db: PostgresDatabase) {
    super(db);
  }

  async listByJobId(jobId: string): Promise<JobMemory[]> {
    return this.exec("job_memories.list_by_job_id", async () => {
      const rows = await this.db.select().from(jobMemoriesTable).where(eq(jobMemoriesTable.jobId, jobId)).orderBy(desc(jobMemoriesTable.updatedAt));
      return rows.map((row: unknown) => mapJobMemory(row as Record<string, unknown>));
    });
  }

  async upsert(memory: JobMemory): Promise<JobMemory> {
    return this.exec("job_memories.upsert", async () => {
      await this.db
        .insert(jobMemoriesTable)
        .values({
          id: memory.id,
          jobId: memory.jobId,
          key: memory.key,
          value: memory.value,
          updatedAt: new Date(memory.updatedAt)
        })
        .onConflictDoUpdate({
          target: [jobMemoriesTable.jobId, jobMemoriesTable.key],
          set: {
            value: memory.value,
            updatedAt: new Date(memory.updatedAt)
          }
        });
      return memory;
    });
  }
}
