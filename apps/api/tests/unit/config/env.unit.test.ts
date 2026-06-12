import { describe, expect, it } from "vitest";
import { loadConfig } from "../../../src/config/config.js";

describe("loadConfig", () => {
  it("maps validated API environment variables into runtime config", () => {
    const config = loadConfig({
      PORT: "4200",
      NODE_ENV: "development",
      DB_DRIVER: "postgres",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5433/personal_agent_os",
      API_CORS_ORIGIN: "http://localhost:5173",
      AWS_REGION: "us-west-2",
      DEFAULT_TIMEZONE: "America/Los_Angeles",
      CLERK_SECRET_KEY: "sk_test_example",
      CLERK_PUBLISHABLE_KEY: "pk_test_example"
    });

    expect(config).toEqual({
      port: 4200,
      env: "development",
      dbDriver: "postgres",
      databaseUrl: "postgres://postgres:postgres@localhost:5433/personal_agent_os",
      apiCorsOrigin: ["http://localhost:5173"],
      awsRegion: "us-west-2",
      defaultTimezone: "America/Los_Angeles",
      clerkSecretKey: "sk_test_example",
      clerkPublishableKey: "pk_test_example"
    });
  });

  it("supports a comma-delimited list of CORS origins", () => {
    const config = loadConfig({
      PORT: "4200",
      NODE_ENV: "development",
      DB_DRIVER: "postgres",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5433/personal_agent_os",
      API_CORS_ORIGIN: "http://localhost:5173, https://app.example.com ,https://admin.example.com",
      AWS_REGION: "us-west-2",
      DEFAULT_TIMEZONE: "America/Los_Angeles",
      CLERK_SECRET_KEY: "sk_test_example",
      CLERK_PUBLISHABLE_KEY: "pk_test_example"
    });

    expect(config.apiCorsOrigin).toEqual([
      "http://localhost:5173",
      "https://app.example.com",
      "https://admin.example.com"
    ]);
  });

  it("fails fast when API_CORS_ORIGIN is missing", () => {
    expect(() =>
      loadConfig({
        PORT: "4200",
        NODE_ENV: "development",
        DB_DRIVER: "postgres",
        DATABASE_URL: "postgres://postgres:postgres@localhost:5433/personal_agent_os",
        AWS_REGION: "us-west-2",
        DEFAULT_TIMEZONE: "America/Los_Angeles",
        CLERK_SECRET_KEY: "sk_test_example",
        CLERK_PUBLISHABLE_KEY: "pk_test_example"
      })
    ).toThrow("API environment validation failed");
  });

  it("fails fast when API_CORS_ORIGIN does not contain any origins", () => {
    expect(() =>
      loadConfig({
        PORT: "4200",
        NODE_ENV: "development",
        DB_DRIVER: "postgres",
        DATABASE_URL: "postgres://postgres:postgres@localhost:5433/personal_agent_os",
        API_CORS_ORIGIN: " ,  , ",
        AWS_REGION: "us-west-2",
        DEFAULT_TIMEZONE: "America/Los_Angeles",
        CLERK_SECRET_KEY: "sk_test_example",
        CLERK_PUBLISHABLE_KEY: "pk_test_example"
      })
    ).toThrow("API environment validation failed");
  });
});
