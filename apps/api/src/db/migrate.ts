import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Pool } from "pg";
import { loadConfig } from "../config/config.js";
import { pquery } from "./pquery.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(currentDirectory, "migrations");

export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pquery(pool, `
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      const alreadyApplied = await pquery(pool, "select 1 from schema_migrations where version = $1", [file]);
      if (alreadyApplied.rowCount) {
        continue;
      }

      const sql = await readFile(join(migrationsDirectory, file), "utf8");
      const client = await pool.connect();
      try {
        await pquery(client, "begin");
        await pquery(client, sql);
        await pquery(client, "insert into schema_migrations (version) values ($1)", [file]);
        await pquery(client, "commit");
      } catch (error) {
        await pquery(client, "rollback");
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

async function main() {
  const config = loadConfig();
  await runMigrations(config.databaseUrl);
  console.log("Migrations complete");
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === executedPath) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
