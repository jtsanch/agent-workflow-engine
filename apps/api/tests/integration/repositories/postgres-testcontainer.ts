import { randomUUID } from "node:crypto";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { createPostgresClient } from "../../../src/db/client.js";
import { PostgresDatabase } from "../../../src/db/database.js";
import { runMigrations } from "../../../src/db/migrate.js";
import { pquery } from "../../../src/db/pquery.js";

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

function buildDatabaseUrl(baseUrl: string, databaseName: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function createContextForDatabase(databaseUrl: string, closeDatabase: () => Promise<void>) {
  await runMigrations(databaseUrl);
  const { pool, db } = createPostgresClient(databaseUrl);
  const database = new PostgresDatabase(pool, db);

  return {
    database,
    async reset() {
      await pquery(
        pool,
        "truncate table node_feedback, node_executions, tool_invocations, job_runs, job_memories, job_alert_preferences, job_schedules, jobs, users restart identity cascade"
      );
    },
    async close() {
      await pool.end();
      await closeDatabase();
    }
  };
}

export async function createRepositoryTestContext() {
  const sharedDatabaseUrl = process.env.REPOSITORY_TEST_DATABASE_URL;
  if (sharedDatabaseUrl) {
    const adminPool = new Pool({ connectionString: buildDatabaseUrl(sharedDatabaseUrl, "postgres") });
    const databaseName = `repo_test_${randomUUID().replaceAll("-", "_")}`;

    try {
      await pquery(adminPool, `create database ${quoteIdentifier(databaseName)}`);
      return await createContextForDatabase(buildDatabaseUrl(sharedDatabaseUrl, databaseName), async () => {
        try {
          await pquery(
            adminPool,
            "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
            [databaseName]
          );
          await pquery(adminPool, `drop database if exists ${quoteIdentifier(databaseName)}`);
        } finally {
          await adminPool.end();
        }
      });
    } catch (error) {
      await adminPool.end();
      throw error;
    }
  }

  const container = await new PostgreSqlContainer("postgres:16-alpine").start();

  try {
    return await createContextForDatabase(container.getConnectionUri(), async () => {
      await container.stop();
    });
  } catch (error) {
    await container.stop();
    throw error;
  }
}
