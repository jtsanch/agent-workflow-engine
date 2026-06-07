# Repo Operating Guide

This repository is a TypeScript monorepo for a workflow platform with three runtime applications:

- `apps/web`: authenticated control-plane UI
- `apps/api`: control-plane API
- `apps/worker`: asynchronous execution worker

Shared contracts live in workspace packages and are consumed by all runtimes.

## Durable Architecture Contracts

- The web app is a control-plane client. It does not own business rules.
- The API owns authenticated request handling, validation, authorization, and persistence-facing orchestration.
- The worker owns asynchronous run execution.
- Shared packages define cross-runtime contracts. Runtime-specific behavior should not be duplicated across apps.
- A `job` is the control-plane object users create and own.
- A `run` is an execution attempt for a job.
- The production execution contract is asynchronous: the API queues runs and the worker executes them.

## Ownership Boundaries

- `apps/web/src/pages`: route-level UI orchestration
- `apps/web/src/components`: reusable presentation and workflow visualization
- `apps/web/src/auth`: frontend auth bootstrap and session-aware state
- `apps/web/src/lib`: API client boundary
- `apps/api/src/modules`: HTTP route registration only
- `apps/api/src/services`: application orchestration and policy
- `apps/api/src/repositories`: persistence abstractions and adapters
- `apps/api/src/db`: database schema and migrations
- `apps/worker/src/runtime`: execution engine and queue processing
- `apps/worker/src/tools`: worker tool registry wiring
- `packages/shared`: domain types and validation schemas
- `packages/agent-sdk`: agent definitions and tool definitions
- `packages/ui-schema`: config-driven UI schema contracts
- `packages/observability`: logging and metrics interfaces
- `infra/terraform`: deployment shape and cloud module skeletons

## Engineering Rules

- Prefer shared contracts over runtime-local copies.
- Keep API controllers thin. Put request policy and orchestration in services.
- Keep persistence details behind repositories in the API.
- Treat the worker as the owner of background execution semantics.
- Document stable contracts, not incidental implementation details.
- When introducing a new feature, decide first which runtime owns it:
  web for presentation, api for control-plane policy, worker for execution.

## Testing Expectations

- Unit tests cover service, runtime, and package behavior in isolation.
- Integration tests cover API composition, repository adapters, and worker execution flows.
- Cross-runtime contract changes should be validated in the shared package first, then in the consuming runtime tests.

## Documentation Expectations

- `docs/architecture/architecture.md` is the durable system contract.
- `docs/architecture/code-map.md` is the ownership map.
- `docs/architecture/coding-standards.md` defines engineering conventions.
- `docs/architecture/infra.md` defines deployment shape and infrastructure boundaries.

When code and docs disagree, update the docs to match the durable production contract, not temporary local implementation shortcuts.
