# Agent Workflow Engine

Config-driven agent platform for orchestrating multi-step workflows with structured inputs, execution tracking, and worker-based processing.

Built as a TypeScript monorepo with a focus on:

- separating configuration from execution
- enabling structured, multi-step workflows
- supporting scalable worker-based processing
- maintaining clear system boundaries across services

## What This Demonstrates

- Designing a multi-service system (API, worker, frontend)
- Config-driven workflow definition and execution
- Separation of concerns across controller, service, and persistence layers
- Background job processing and execution tracking
- Realistic infrastructure considerations (Postgres, ECS-style services)

## Vertical Slice

1. `GET /agents` lists available agent definitions.
2. `POST /jobs` validates and stores a new job.
3. `GET /jobs` returns the created job.
4. `POST /runs/simulate` performs a simulated worker run for a job.
5. `GET /runs` shows the recorded runs and steps.

For a more production-like path:

1. `POST /runs` queues a run in PostgreSQL.
2. `apps/worker` polls for queued runs and executes them.
3. `GET /ready` checks whether the API is ready to serve traffic and whether the database is reachable.

## Monorepo Layout

- `apps/web`: React + Vite frontend for S3 + CloudFront
- `apps/api`: REST API for ECS Fargate
- `apps/worker`: background runner for ECS Fargate
- `packages/shared`: domain types, Zod schemas, prompt helpers
- `packages/agent-sdk`: agent and tool registration helpers
- `packages/ui-schema`: config-driven form schema
- `packages/observability`: logger and metrics stubs
- `infra/terraform`: AWS skeleton modules and a dev environment

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL 16+ for a real database-backed deployment

### Install

```bash
pnpm install
```

### Start local Docker dependencies

```bash
./docker-init.sh up
```

This starts:

- PostgreSQL on `localhost:5433`
- Adminer on `http://localhost:8080`

Connection settings:

- Server: `postgres`
- Username: `postgres`
- Password: `postgres`
- Database: `personal_agent_os`

You can also run the same helper from app folders:

```bash
./apps/api/docker-init.sh up
./apps/worker/docker-init.sh up
```

Useful commands:

```bash
./docker-init.sh status
./docker-init.sh logs
./docker-init.sh down
./docker-init.sh reset
```

### Run the apps locally

```bash
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env

pnpm --filter @personal-agent-os/api migrate
pnpm --filter @personal-agent-os/api dev
pnpm --filter @personal-agent-os/worker dev
pnpm --filter @personal-agent-os/web dev
```

For local Postgres-backed development, set `DB_DRIVER=postgres` in both `apps/api/.env` and `apps/worker/.env`.
The local `DATABASE_URL` should point to `localhost:5433` for this repo so it can coexist with other projects using `5432`.

Recommended startup order:

1. `./docker-init.sh up`
2. `pnpm --filter @personal-agent-os/api migrate`
3. `pnpm --filter @personal-agent-os/api dev`
4. `pnpm --filter @personal-agent-os/worker dev`
5. `pnpm --filter @personal-agent-os/web dev`

Important: migrations are intentionally a separate step from API startup. The API does not auto-run migrations on boot, which keeps deployment safer when multiple API containers start in parallel.

### Typecheck the workspace

```bash
pnpm typecheck
```

### Run API tests

```bash
pnpm lint:services
pnpm test:unit:services
pnpm test:integration:services
pnpm test:coverage:services

pnpm test
pnpm --filter @personal-agent-os/api test
pnpm --filter @personal-agent-os/api test:unit
pnpm --filter @personal-agent-os/api test:integration
pnpm --filter @personal-agent-os/api test:coverage
pnpm --filter @personal-agent-os/worker test
pnpm --filter @personal-agent-os/worker test:unit
pnpm --filter @personal-agent-os/worker test:integration
pnpm --filter @personal-agent-os/worker test:coverage
```

Coverage for service CI is enforced through Vitest with the V8 provider and 80% thresholds for lines, functions, statements, and branches.

## Environment

Sample environment files are included in:

- `apps/api/.env.example`
- `apps/worker/.env.example`

For local MVP usage, set `DB_DRIVER=postgres` for the API and worker and run migrations before starting services.

## Architecture Notes

- Web is config-driven and builds forms from each agent definition's UI schema.
- Backend follows `controller -> service -> repository -> db`.
- PostgreSQL DDL lives in `apps/api/src/db/migrations`.
- AWS infrastructure is intentionally skeletal and split into focused Terraform modules.
- Step Functions are deliberately left optional for future orchestration.

## Next Steps

- Replace in-memory repositories with PostgreSQL-backed implementations
- Add auth and tenant isolation
- Add EventBridge Scheduler reconciliation for job schedules
- Wire real LLM and notification providers
