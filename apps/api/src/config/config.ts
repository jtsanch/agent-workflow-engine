import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DB_DRIVER: z.enum(["memory", "postgres"]).default("memory"),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5433/personal_agent_os"),
  AWS_REGION: z.string().default("us-west-2"),
  DEFAULT_TIMEZONE: z.string().default("America/Los_Angeles")
});

export type AppConfig = {
  port: number;
  env: "development" | "test" | "production";
  dbDriver: "memory" | "postgres";
  databaseUrl: string;
  awsRegion: string;
  defaultTimezone: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);

  if (!parsed.success) {
    console.error("Invalid API environment variables");
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("API environment validation failed");
  }

  const data = parsed.data;

  return Object.freeze({
    port: data.PORT,
    env: data.NODE_ENV,
    dbDriver: data.DB_DRIVER,
    databaseUrl: data.DATABASE_URL,
    awsRegion: data.AWS_REGION,
    defaultTimezone: data.DEFAULT_TIMEZONE
  });
}
