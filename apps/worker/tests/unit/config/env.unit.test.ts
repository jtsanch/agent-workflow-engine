import { describe, expect, it } from "vitest";
import { loadWorkerConfig } from "../../../src/config/config.js";

describe("loadWorkerConfig", () => {
  it("parses explicit postgres settings for the worker", () => {
    const config = loadWorkerConfig({
      NODE_ENV: "development",
      DB_DRIVER: "postgres",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5433/personal_agent_os",
      JOB_POLL_INTERVAL_MS: "2500",
      WORKER_CONCURRENCY: "3"
    });

    expect(config).toEqual({
      env: "development",
      dbDriver: "postgres",
      databaseUrl: "postgres://postgres:postgres@localhost:5433/personal_agent_os",
      jobPollIntervalMs: 2500,
      workerConcurrency: 3
    });
  });
});
