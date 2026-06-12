import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DB_DRIVER: z.enum(["memory", "postgres"]).default("memory"),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5433/personal_agent_os"),
  API_CORS_ORIGIN: z
    .string()
    .min(1)
    .transform((value, context) => {
      const origins = value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);

      if (origins.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "API_CORS_ORIGIN must contain at least one origin"
        });
        return z.NEVER;
      }

      return origins.map((origin) => {
        try {
          return new URL(origin).origin;
        } catch {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `API_CORS_ORIGIN contains an invalid URL: ${origin}`
          });
          return z.NEVER;
        }
      });
    }),
  AWS_REGION: z.string().default("us-west-2"),
  DEFAULT_TIMEZONE: z.string().default("America/Los_Angeles"),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_PUBLISHABLE_KEY: z.string().min(1)
});

export type AppConfig = {
  port: number;
  env: "development" | "test" | "production";
  dbDriver: "memory" | "postgres";
  databaseUrl: string;
  apiCorsOrigin: string[];
  awsRegion: string;
  defaultTimezone: string;
  clerkSecretKey: string;
  clerkPublishableKey: string;
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
    apiCorsOrigin: data.API_CORS_ORIGIN,
    awsRegion: data.AWS_REGION,
    defaultTimezone: data.DEFAULT_TIMEZONE,
    clerkSecretKey: data.CLERK_SECRET_KEY,
    clerkPublishableKey: data.CLERK_PUBLISHABLE_KEY
  });
}
