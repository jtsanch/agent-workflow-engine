import { config as loadDotenv } from "dotenv";
import { runFlywayCommand } from "../src/db/flyway.js";

type FlywayCommand = "migrate" | "validate" | "info";

function shouldLoadEnvFile(): boolean {
  return process.env.LOAD_ENV_FILE !== "false";
}

function resolveDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return databaseUrl;
}

function resolveCommand(input: string | undefined): FlywayCommand {
  if (input === "migrate" || input === "validate" || input === "info") {
    return input;
  }

  throw new Error("Usage: tsx scripts/flyway.ts <migrate|validate|info>");
}

async function main() {
  if (shouldLoadEnvFile()) {
    loadDotenv();
  }

  const command = resolveCommand(process.argv[2]);
  runFlywayCommand(command, resolveDatabaseUrl());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
