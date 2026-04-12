import { eq, inArray } from "drizzle-orm";
import type { NodeFeedback } from "@personal-agent-os/shared";
import type { PostgresDatabase } from "../../db/database.js";
import { nodeExecutionsTable, nodeFeedbackTable } from "../../db/schema/index.js";
import { BaseRepository } from "../base-repository.js";
import type { NodeFeedbackRepository } from "../interfaces.js";
import { mapNodeFeedback } from "./mappers.js";

export class PostgresNodeFeedbackRepository extends BaseRepository implements NodeFeedbackRepository {
  constructor(db: PostgresDatabase) {
    super(db);
  }

  async listByRunId(jobRunId: string): Promise<NodeFeedback[]> {
    return this.exec("node_feedback.list_by_run_id", async () => {
      const executionRows = await this.db
        .select({ id: nodeExecutionsTable.id })
        .from(nodeExecutionsTable)
        .where(eq(nodeExecutionsTable.jobRunId, jobRunId));
      const executionIds = executionRows.map((row) => row.id);

      if (executionIds.length === 0) {
        return [];
      }

      const rows = await this.db
        .select()
        .from(nodeFeedbackTable)
        .where(inArray(nodeFeedbackTable.nodeExecutionId, executionIds));
      return rows.map((row: unknown) => mapNodeFeedback(row as Record<string, unknown>));
    });
  }

  async listByExecutionIds(nodeExecutionIds: string[]): Promise<NodeFeedback[]> {
    return this.exec("node_feedback.list_by_execution_ids", async () => {
      if (nodeExecutionIds.length === 0) {
        return [];
      }

      const rows = await this.db
        .select()
        .from(nodeFeedbackTable)
        .where(inArray(nodeFeedbackTable.nodeExecutionId, nodeExecutionIds));
      return rows.map((row: unknown) => mapNodeFeedback(row as Record<string, unknown>));
    });
  }

  async createMany(nodeFeedback: NodeFeedback[]): Promise<NodeFeedback[]> {
    return this.exec("node_feedback.create_many", async () => {
      if (nodeFeedback.length === 0) {
        return [];
      }

      await this.db.insert(nodeFeedbackTable).values(
        nodeFeedback.map((feedback) => ({
          id: feedback.id,
          nodeExecutionId: feedback.nodeExecutionId,
          sourceNodeId: feedback.sourceNodeId,
          targetNodeId: feedback.targetNodeId || null,
          score: String(feedback.score),
          shouldRetry: feedback.shouldRetry,
          summary: feedback.summary,
          createdAt: new Date(feedback.createdAt)
        }))
      );

      return nodeFeedback;
    });
  }
}
