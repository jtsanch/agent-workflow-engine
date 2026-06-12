import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const apiDirectory = resolve(currentDirectory, "../..");
const migrationsDirectory = resolve(currentDirectory, "migrations");
const flywayConfigPath = resolve(apiDirectory, "flyway.conf");

function resolveJdbcUrl(databaseUrl: string): { jdbcUrl: string; username: string; password: string } {
  const url = new URL(databaseUrl);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);

  if (!username) {
    throw new Error("DATABASE_URL must include a username for Flyway");
  }

  let hostname = url.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    hostname = "host.docker.internal";
  }

  const path = url.pathname || "/";
  const query = url.search || "";

  return {
    jdbcUrl: `jdbc:postgresql://${hostname}:${url.port || "5432"}${path}${query}`,
    username,
    password
  };
}

export function runFlywayCommand(command: "migrate" | "validate" | "info", databaseUrl: string): void {
  if (!existsSync(flywayConfigPath)) {
    throw new Error(`Flyway config not found at ${flywayConfigPath}`);
  }

  if (!existsSync(migrationsDirectory)) {
    throw new Error(`Flyway migrations directory not found at ${migrationsDirectory}`);
  }

  const { jdbcUrl, username, password } = resolveJdbcUrl(databaseUrl);
  const args = [
    "run",
    "--rm",
    "--add-host=host.docker.internal:host-gateway",
    "-v",
    `${migrationsDirectory}:/flyway/sql:ro`,
    "-v",
    `${flywayConfigPath}:/flyway/conf/flyway.conf:ro`,
    "flyway/flyway:11-alpine",
    `-configFiles=/flyway/conf/flyway.conf`,
    `-url=${jdbcUrl}`,
    `-user=${username}`,
    `-password=${password}`,
    command
  ];

  const result = spawnSync("docker", args, {
    cwd: apiDirectory,
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Flyway ${command} failed with exit code ${result.status ?? "unknown"}`);
  }
}

export function runMigrations(databaseUrl: string): void {
  runFlywayCommand("migrate", databaseUrl);
}
