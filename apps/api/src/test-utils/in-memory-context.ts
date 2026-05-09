import type { AppContext } from "../app-context.js";
import { createAppContext } from "../app-context.js";
import type { AppConfig } from "../config/config.js";

export function createInMemoryAppContext(overrides: Partial<AppConfig> = {}): AppContext {
  return createAppContext({
    port: 4000,
    env: "test",
    dbDriver: "memory",
    databaseUrl: "postgres://postgres:postgres@localhost:5433/personal_agent_os",
    awsRegion: "us-west-2",
    defaultTimezone: "America/Los_Angeles",
    clerkSecretKey: "sk_test_example",
    clerkPublishableKey: "pk_test_example",
    ...overrides
  });
}
