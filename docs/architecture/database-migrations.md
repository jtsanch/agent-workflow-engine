# Database Migrations

This repository uses Flyway as the migration authority for PostgreSQL schema changes.

## Source Of Truth

- SQL migration files in `apps/api/src/db/migrations` are the authoritative migration history.
- Drizzle schema files in `apps/api/src/db/schema` model the current database shape for application code.
- Drizzle does not generate or own production migrations in this repository.

## Migration Workflow

1. Add a new ordered Flyway migration file in `apps/api/src/db/migrations`.
2. Update the Drizzle schema in `apps/api/src/db/schema` to match the SQL change.
3. Run `pnpm db:validate` to verify Flyway SQL and Drizzle stay aligned.
4. Commit the SQL migration and Drizzle schema change together.
5. Manually apply the migration to Neon with `DATABASE_URL=... pnpm db:migrate:prod`.

## Migration File Naming

Use Flyway versioned SQL filenames:

- `V1__users.sql`
- `V2__jobs.sql`
- `V3__job_schedules.sql`

Each new migration must use the next ordered version number.

## Local Commands

- `pnpm db:migrate:local`
  Applies Flyway migrations to the database referenced by local `DATABASE_URL`.
- `pnpm db:validate`
  Creates a temporary validation database, applies Flyway migrations, runs `drizzle-kit check`, and fails if Drizzle would still change the migrated schema.
- `pnpm --filter @personal-agent-os/api db:info`
  Shows Flyway migration state for the current `DATABASE_URL`.

## Manual Neon Migrations

Production migrations stay manual for now.

1. Confirm the target Neon connection string.
2. Run `DATABASE_URL=postgresql://... pnpm db:migrate:prod`.
3. Review the Flyway output and confirm the expected versions were applied.
4. Deploy the API and worker after the database is updated when the change requires new runtime behavior.

Do not wire `db:migrate:prod` into Vercel or Railway deploy hooks.

## Validation In CI

CI validates schema consistency only. It does not run production migrations.

The CI flow:

1. builds the project
2. creates a temporary validation database in CI Postgres
3. applies Flyway migrations
4. checks that Drizzle has no remaining schema changes to push

If Flyway SQL and Drizzle schema diverge, CI fails.

## Future Path

This setup keeps production migration application manual and low risk today while preparing the repository for a future automated migration job that can reuse the same Flyway command path.
