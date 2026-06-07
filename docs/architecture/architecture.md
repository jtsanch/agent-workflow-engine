# Architecture

This repository is a TypeScript monorepo for a workflow platform with a clear split between control-plane behavior and asynchronous execution.

The durable system contract is:

- users authenticate in the web app
- the API authorizes and persists control-plane state
- the API queues execution requests as runs
- the worker executes queued runs asynchronously
- shared packages define the contracts used across all runtimes

## Runtime Model

### Web

The web app is the authenticated control-plane client.

It is responsible for:

- session-aware navigation
- rendering config-driven job creation experiences
- listing jobs and runs
- presenting admin and usage views

The web app is not the source of truth for business policy. It consumes API contracts.

### API

The API is the control-plane service.

It is responsible for:

- authentication and request authorization
- input validation
- job, run, usage, alert, and user orchestration
- persistence coordination
- read models needed by the UI

The API owns synchronous request-response behavior. It does not own long-running execution.

### Worker

The worker is the asynchronous execution service.

It is responsible for:

- claiming queued runs
- executing workflow DAGs
- persisting execution telemetry and outputs
- enforcing execution-time usage limits

The worker is the execution-plane owner.

### Shared Packages

Shared packages provide the contracts that keep runtimes aligned:

- domain types and validation schemas
- agent definitions and tool definitions
- UI schema contracts
- observability interfaces

Shared packages are the preferred location for cross-runtime concepts.

## Core Domain Contracts

### Agent Definition

An agent definition is a configuration-owned workflow template.

It defines:

- a stable identifier
- input contract
- UI schema
- DAG definition

The UI and execution layers both depend on the same definition contract.

### Job

A job is the control-plane object users create and own.

A job binds:

- an agent definition
- validated input
- scheduling intent
- alerting intent
- user ownership

Jobs are durable records and may be executed multiple times.

### Run

A run is a single execution attempt for a job.

The durable production contract is:

- the API creates queued runs
- the worker executes queued runs asynchronously
- run state and execution telemetry are persisted for later inspection

### Usage and Access

Access control and usage limits are first-class platform concerns.

The system contract includes:

- authenticated access
- local platform users
- user approval state
- role-based admin access
- usage summaries and audit events

## Architectural Boundaries

### Control Plane vs Execution Plane

This is the most important boundary in the repository.

- control plane: web and API
- execution plane: worker

The control plane defines, validates, and schedules work.
The execution plane performs work and records runtime telemetry.

### Layering Inside the API

The API follows a stable layered boundary:

- controllers own HTTP concerns
- services own application orchestration and policy
- repositories own persistence access
- database schema and migrations define storage contracts

This boundary keeps request handling separate from persistence details.

### Workflow Execution

Workflow execution is DAG-based.

The durable execution contract is:

- dependencies are derived from node input bindings
- execution state is runtime-scoped per run
- node outputs are retained for observability
- retries are part of workflow execution semantics

This repository treats execution as deterministic workflow processing rather than ad hoc background jobs.

## Data Contracts

PostgreSQL is the system of record for:

- users and access state
- jobs
- runs
- usage tracking
- execution telemetry
- workflow-related operational data

Database migrations are explicit and are not coupled to API startup.

## Frontend Contract

The frontend is config-driven where user input is agent-specific.

That means:

- job creation is driven from shared agent/UI contracts
- route pages orchestrate API calls and screen state
- reusable components remain presentation-focused

The frontend should reflect backend policy, not re-implement it.

## What Is Intentionally Stable

- monorepo split between `apps/*`, `packages/*`, and `infra/*`
- authenticated control-plane UI
- API as control-plane owner
- worker as asynchronous execution owner
- shared contracts across runtimes
- PostgreSQL-backed durable state
- explicit migrations
- config-driven workflow definitions

## What Is Intentionally Not a Repo Contract

- temporary compatibility paths
- local-only shortcuts
- incidental naming left over from earlier slices
- exact internal execution heuristics
- specific future cloud rollout details beyond the current deployment shape
