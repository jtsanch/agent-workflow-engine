import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { Client } from "pg";
import { runFlywayCommand } from "../src/db/flyway.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const apiDirectory = resolve(currentDirectory, "..");

function resolveDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for db:validate");
  }

  return databaseUrl;
}

function withDatabaseName(databaseUrl: string, databaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function createValidationDatabase(databaseUrl: string): Promise<{
  validationDatabaseUrl: string;
  cleanup(): Promise<void>;
}> {
  const adminDatabaseUrl = withDatabaseName(databaseUrl, "postgres");
  const validationDatabaseName = `schema_drift_${randomUUID().replace(/-/g, "")}`;
  const adminClient = new Client({ connectionString: adminDatabaseUrl });

  await adminClient.connect();
  await adminClient.query(`create database "${validationDatabaseName}"`);

  return {
    validationDatabaseUrl: withDatabaseName(databaseUrl, validationDatabaseName),
    async cleanup() {
      await adminClient.query(
        `select pg_terminate_backend(pid)
         from pg_stat_activity
         where datname = $1 and pid <> pg_backend_pid()`,
        [validationDatabaseName]
      );
      await adminClient.query(`drop database if exists "${validationDatabaseName}"`);
      await adminClient.end();
    }
  };
}

function runDrizzleCheck(): void {
  const result = spawnSync("pnpm", ["exec", "drizzle-kit", "check", "--config", "drizzle.config.ts"], {
    cwd: apiDirectory,
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`drizzle-kit check failed with exit code ${result.status ?? "unknown"}`);
  }
}

function assertNoDrift(validationDatabaseUrl: string): void {
  const result = spawnSync(
    "pnpm",
    ["exec", "drizzle-kit", "push", "--config", "drizzle.config.ts", "--verbose", "--strict"],
    {
      cwd: apiDirectory,
      encoding: "utf8",
      input: "No\n",
      env: {
        ...process.env,
        DATABASE_URL: validationDatabaseUrl
      }
    }
  );

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  if (result.error) {
    throw result.error;
  }

  if (result.status === 0) {
    return;
  }

  throw new Error(`Schema drift detected between Flyway SQL and Drizzle schema.\n${output}`.trim());
}

async function main() {
  loadDotenv();

  const databaseUrl = resolveDatabaseUrl();
  runDrizzleCheck();

  const validationDatabase = await createValidationDatabase(databaseUrl);

  try {
    runFlywayCommand("migrate", validationDatabase.validationDatabaseUrl);
    assertNoDrift(validationDatabase.validationDatabaseUrl);
    console.log("Schema validation passed");
  } finally {
    await validationDatabase.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
