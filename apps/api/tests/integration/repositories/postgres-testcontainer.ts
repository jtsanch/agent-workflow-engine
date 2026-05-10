import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { createPostgresClient } from "../../../src/db/client.js";
import { PostgresDatabase } from "../../../src/db/database.js";
import { runMigrations } from "../../../src/db/migrate.js";

export async function createRepositoryTestContext() {
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const databaseUrl = container.getConnectionUri();
  await runMigrations(databaseUrl);
  const { pool, db } = createPostgresClient(databaseUrl);
  const database = new PostgresDatabase(pool, db);

  return {
    database,
    async reset() {
      await pool.query(
        "truncate table node_feedback, node_executions, tool_invocations, job_runs, job_memories, job_alert_preferences, job_schedules, jobs, users restart identity cascade"
      );
    },
    async close() {
      await pool.end();
      await container.stop();
    }
  };
}
