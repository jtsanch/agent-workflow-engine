import "dotenv/config";
import { pathToFileURL } from "node:url";
import { loadConfig } from "../config/config.js";
import { runMigrations as migrateWithFlyway } from "./flyway.js";

export async function runMigrations(databaseUrl: string): Promise<void> {
  migrateWithFlyway(databaseUrl);
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
