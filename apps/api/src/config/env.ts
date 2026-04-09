import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DB_DRIVER: z.enum(["memory", "postgres"]).default("memory"),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5433/personal_agent_os"),
  AWS_REGION: z.string().default("us-west-2"),
  DEFAULT_TIMEZONE: z.string().default("America/Los_Angeles")
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}
