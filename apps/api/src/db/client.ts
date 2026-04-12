import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { schema } from "./schema/index.js";

export type ApiDatabase = NodePgDatabase<typeof schema>;

export function createPostgresClient(databaseUrl: string): { pool: Pool; db: ApiDatabase } {
  const pool = new Pool({ connectionString: databaseUrl });

  return {
    pool,
    db: drizzle(pool, { schema })
  };
}
