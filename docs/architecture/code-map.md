# Code Map

This document maps durable ownership boundaries in the repository. It is not a file-by-file inventory.

## Top-Level Layout

```txt
apps/
  web/
  api/
  worker/

packages/
  shared/
  agent-sdk/
  ui-schema/
  observability/

infra/
  terraform/
```

## Application Ownership

### `apps/web`

Owns the authenticated control-plane user experience.

Primary responsibilities:

- route pages
- auth-aware UI state
- API client integration
- workflow and run visualization

Sub-boundaries:

- `src/pages`: screen-level orchestration
- `src/components`: reusable presentation and visualization
- `src/auth`: frontend auth bootstrap and approval-state handling
- `src/lib`: API boundary for browser-to-backend communication

### `apps/api`

Owns control-plane policy and persistence orchestration.

Primary responsibilities:

- auth enforcement
- request validation
- job and run orchestration
- user and admin operations
- usage and alert read/write flows

Sub-boundaries:

- `src/modules`: HTTP route registration
- `src/services`: application services and policy
- `src/repositories`: persistence contracts and adapters
- `src/db`: schema, migrations, database wiring
- `src/common`: shared API-only concerns

### `apps/worker`

Owns asynchronous workflow execution.

Primary responsibilities:

- queue polling and claiming
- DAG execution
- retry behavior
- execution telemetry persistence
- execution-time usage enforcement

Sub-boundaries:

- `src/runtime`: execution engine and queue processing
- `src/tools`: worker tool registry wiring
- `src/config`: worker runtime configuration

## Shared Package Ownership

### `packages/shared`

Owns cross-runtime domain contracts.

Use it for:

- domain types
- validation schemas
- stable request and response contracts

Do not use it for runtime-specific policy.

### `packages/agent-sdk`

Owns workflow and tool definition contracts.

Use it for:

- agent definitions
- tool definitions
- shared execution-facing helpers

### `packages/ui-schema`

Owns config-driven UI schema contracts consumed by the frontend and definitions.

### `packages/observability`

Owns logging and metrics interfaces shared by runtimes.

## Infrastructure Ownership

### `infra/terraform`

Owns deployment shape, not product logic.

Current concerns:

- network
- load balancing and frontend delivery
- image repositories
- API and worker service shells
- database shell
- secrets namespace
- scheduler shell

## Ownership Rules

- If a concern is user-facing presentation, it belongs in `apps/web`.
- If a concern is request policy, authorization, or persistence orchestration, it belongs in `apps/api`.
- If a concern is asynchronous execution semantics, it belongs in `apps/worker`.
- If a concern must be shared across runtimes, define the contract in `packages/*` first.
- If a change needs documentation of a system boundary, update `docs/architecture/*`.
