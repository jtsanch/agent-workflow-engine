import { asc, eq, inArray } from "drizzle-orm";
import type { NodeExecution } from "@personal-agent-os/shared";
import type { PostgresDatabase } from "../../db/database.js";
import { nodeExecutionsTable } from "../../db/schema/index.js";
import { BaseRepository } from "../base-repository.js";
import type { NodeExecutionRepository } from "../interfaces.js";
import { mapNodeExecution } from "./mappers.js";
import { asJsonObject, asNodeOutput } from "../sql-helpers.js";

export class PostgresNodeExecutionRepository extends BaseRepository implements NodeExecutionRepository {
  constructor(db: PostgresDatabase) {
    super(db);
  }

  async listByRunId(jobRunId: string): Promise<NodeExecution[]> {
    return this.exec("node_executions.list_by_run_id", async () => {
      const rows = await this.db
        .select()
        .from(nodeExecutionsTable)
        .where(eq(nodeExecutionsTable.jobRunId, jobRunId))
        .orderBy(asc(nodeExecutionsTable.startedAt));
      return rows.map((row: unknown) => mapNodeExecution(row as Record<string, unknown>));
    });
  }

  async listByRunIds(jobRunIds: string[]): Promise<NodeExecution[]> {
    return this.exec("node_executions.list_by_run_ids", async () => {
      if (jobRunIds.length === 0) {
        return [];
      }

      const rows = await this.db
        .select()
        .from(nodeExecutionsTable)
        .where(inArray(nodeExecutionsTable.jobRunId, jobRunIds))
        .orderBy(asc(nodeExecutionsTable.startedAt));
      return rows.map((row: unknown) => mapNodeExecution(row as Record<string, unknown>));
    });
  }

  async createMany(nodeExecutions: NodeExecution[]): Promise<NodeExecution[]> {
    return this.exec("node_executions.create_many", async () => {
      if (nodeExecutions.length === 0) {
        return [];
      }

      await this.db.insert(nodeExecutionsTable).values(
        nodeExecutions.map((execution) => ({
          id: execution.id,
          jobRunId: execution.jobRunId,
          nodeId: execution.nodeId,
          nodeType: execution.nodeType,
          nodeVersion: execution.nodeVersion,
          status: execution.status,
          input: asJsonObject(execution.input ?? execution.resolvedInput),
          resolvedInput: asJsonObject(execution.resolvedInput),
          output: asNodeOutput(execution.output) ?? null,
          errorMessage: execution.errorMessage ?? null,
          latencyMs: execution.latencyMs ?? 0,
          tokenUsage: execution.tokenUsage ?? 0,
          costUsd: execution.costUsd?.toString() ?? null,
          retryCount: execution.retryCount,
          startedAt: new Date(execution.startedAt),
          completedAt: execution.completedAt ? new Date(execution.completedAt) : null
        }))
      );

      return nodeExecutions;
    });
  }
}
