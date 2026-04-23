import { inArray } from "drizzle-orm";
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

  async listByExecutionIds(nodeExecutionIds: string[]): Promise<ToolInvocation[]> {
    return this.exec("tool_invocations.list_by_execution_ids", async () => {
      if (nodeExecutionIds.length === 0) {
        return [];
      }

      const rows = await this.db
        .select()
        .from(toolInvocationsTable)
        .where(inArray(toolInvocationsTable.nodeExecutionId, nodeExecutionIds));

      return rows.map((row: unknown) => mapToolInvocation(row as Record<string, unknown>));
    });
  }

  async createMany(invocations: ToolInvocation[]): Promise<ToolInvocation[]> {
    return this.exec("tool_invocations.create_many", async () => {
      if (invocations.length === 0) {
        return [];
      }

      await this.db.insert(toolInvocationsTable).values(
        invocations.map((invocation) => ({
          id: invocation.id,
          nodeExecutionId: invocation.nodeExecutionId,
          toolName: invocation.toolName,
          request: invocation.request,
          response: invocation.response ?? null,
          status: invocation.status,
          createdAt: new Date(invocation.createdAt)
        }))
      );

      return invocations.map((row) =>
        mapToolInvocation({
          ...row,
          created_at: row.createdAt,
          node_execution_id: row.nodeExecutionId,
          tool_name: row.toolName
        })
      );
    });
  }
}
