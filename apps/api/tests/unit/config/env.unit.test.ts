import { describe, expect, it } from "vitest";
import { loadConfig } from "../../../src/config/config.js";

describe("loadConfig", () => {
  it("maps validated API environment variables into runtime config", () => {
    const config = loadConfig({
      PORT: "4200",
      NODE_ENV: "development",
      DB_DRIVER: "postgres",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5433/personal_agent_os",
      AWS_REGION: "us-west-2",
      DEFAULT_TIMEZONE: "America/Los_Angeles"
    });

    expect(config).toEqual({
      port: 4200,
      env: "development",
      dbDriver: "postgres",
      databaseUrl: "postgres://postgres:postgres@localhost:5433/personal_agent_os",
      awsRegion: "us-west-2",
      defaultTimezone: "America/Los_Angeles"
    });
  });
});
