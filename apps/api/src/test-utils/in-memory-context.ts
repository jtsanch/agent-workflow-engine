import type { AppContext } from "../app-context.js";
import { createAppContext } from "../app-context.js";
import type { AppConfig } from "../config/env.js";

export function createInMemoryAppContext(overrides: Partial<AppConfig> = {}): AppContext {
  return createAppContext({
    PORT: 4000,
    NODE_ENV: "test",
    DB_DRIVER: "memory",
    DATABASE_URL: "postgres://postgres:postgres@localhost:5433/personal_agent_os",
    AWS_REGION: "us-west-2",
    DEFAULT_TIMEZONE: "America/Los_Angeles",
    ...overrides
  });
}

