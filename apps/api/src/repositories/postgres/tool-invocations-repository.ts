import type { ToolInvocation } from "@personal-agent-os/shared";
import type { PostgresDatabase } from "../../db/database.js";
import { toolInvocationsTable } from "../../db/schema/index.js";
import { BaseRepository } from "../base-repository.js";
import type { ToolInvocationRepository } from "../interfaces.js";
import { mapToolInvocation } from "./mappers.js";

export class PostgresToolInvocationRepository extends BaseRepository implements ToolInvocationRepository {
  constructor(db: PostgresDatabase) {
    super(db);
  }

  async createMany(invocations: ToolInvocation[]): Promise<ToolInvocation[]> {
    return this.exec("tool_invocations.create_many", async () => {
      for (const invocation of invocations) {
        await this.db.insert(toolInvocationsTable).values({
          id: invocation.id,
          jobRunStepId: invocation.jobRunStepId,
          toolName: invocation.toolName,
          request: invocation.request,
          response: invocation.response ?? null,
          status: invocation.status,
          createdAt: new Date(invocation.createdAt)
        });
      }

      return invocations.map((row) =>
        mapToolInvocation({
          ...row,
          created_at: row.createdAt,
          job_run_step_id: row.jobRunStepId,
          tool_name: row.toolName
        })
      );
    });
  }
}
