# Architecture

This document describes the current architecture of `personal-agent-os`, a config-driven personal agent platform built as a TypeScript monorepo.

The current system focuses on a first vertical slice:

- listing available agent definitions
- rendering config-driven job creation forms
- creating jobs through a REST API
- listing jobs and runs
- simulating a worker execution flow

Future orchestration capabilities such as DAG execution, fan-out, scheduling, and distributed workflow coordination are intentionally out of scope for the current version.

---

## 1. System Overview

At a high level, the system consists of:

- **Web App** — renders agent definitions and config-driven job forms
- **API Service** — exposes REST endpoints for agents, jobs, runs, and readiness checks
- **Worker Service** — processes queued runs and simulates execution
- **Shared Packages** — provide schemas, types, prompt helpers, SDK helpers, UI schema definitions, and observability utilities
- **PostgreSQL** — stores jobs, runs, and run steps for local and production-like workflows
- **Terraform Skeleton** — outlines AWS deployment infrastructure for future hosting

The architecture separates frontend rendering, API coordination, worker execution, and shared domain definitions so each layer can evolve independently.

---

## 2. Monorepo Layout

```txt
apps/
  web/        React + Vite frontend
  api/        REST API service
  worker/     background runner

packages/
  shared/           domain types, Zod schemas, prompt helpers
  agent-sdk/        agent and tool registration helpers
  ui-schema/        config-driven form schema
  observability/    logger and metrics utilities

infra/
  terraform/        AWS skeleton modules and dev environment
```

## 3. Core Concepts

### Agent Definitions

Agents are defined through configuration rather than hardcoded UI or workflow logic.

An agent definition describes:

- the agent identifier
- supported inputs
- form schema
- execution-related metadata

The web app uses these definitions to render job creation forms dynamically.

### Jobs

A job represents a user-created request for an agent to perform work.

The API validates job input, stores the job, and exposes endpoints for listing and retrieving jobs.

Current job flow:

Web form → POST /jobs → API validation → repository → database

### Runs

A run represents an execution attempt for a job.

The current system supports two execution paths:

- Simulated execution
  POST /runs/simulate
  useful for validating the end-to-end flow without a real worker pipeline
- Queued execution
  POST /runs
  stores a queued run for worker processing

### Run Steps

Run steps record the stages of a run.

They provide a basic execution history and create the foundation for future observability and debugging.

## 4. API Architecture

The API follows a layered structure:

controller → service → repository → database

### Controllers

Controllers handle:

- HTTP routing
- request validation
- response shaping
- mapping errors to HTTP responses

### Services

Services contain application logic, including:

- creating jobs
- creating runs
- coordinating simulated execution
- enforcing workflow-level rules

### Repositories

Repositories isolate persistence logic from application logic.

This keeps database access separate from request handling and makes the system easier to test.

## 5. Web Architecture

The web app is built around config-driven rendering.

Instead of hardcoding a form for each agent, the frontend reads agent definitions and UI schemas to render forms dynamically.

Current frontend capabilities include:

- listing available agents
- rendering a Create Job form from schema
- submitting jobs to the API
- listing jobs and runs

This keeps the frontend flexible as new agent definitions are added.

## 6. Worker Architecture

The worker is responsible for background run processing.

In the current version, the worker supports a simple queued execution model:

POST /runs → queued run → worker polls → run steps recorded

This is intentionally simpler than a full orchestration engine.

The goal is to validate the basic execution lifecycle before introducing more advanced scheduling or DAG-based execution.

## 7. Data Model

The current data model centers around:

- agents
- jobs
- runs
- run steps

### Jobs

Jobs store the user request and validated input for an agent.

### Runs

Runs track execution attempts for a job.

A job may eventually have multiple runs, though the current vertical slice focuses on basic creation and listing.

### Run Steps

Run steps provide structured execution history for a run.

This creates a foundation for future execution tracing and observability.

## 8. Execution Flow

### Simulated Run Flow

1. User creates a job
2. API validates and stores the job
3. User triggers a simulated run
4. API creates run and step records
5. UI lists the resulting run history

This path is useful for validating the product flow without requiring real agent execution.

### Worker Run Flow

1. User creates a job
2. API queues a run
3. Worker polls for queued runs
4. Worker processes the run
5. Worker records run steps and status updates

This path is the basis for future background execution.

## 9. Current Design Decisions

### Config-driven UI

Agent forms are generated from schema definitions.

This avoids hardcoding frontend forms and makes it easier to add new agent types.

### Shared domain schemas

Types and Zod schemas live in shared packages.

This keeps API validation, frontend form rendering, and worker logic aligned around the same contracts.

### Separate API and worker services

The API handles request/response flows, while the worker handles background execution.

This creates a clean boundary between synchronous user actions and asynchronous processing.

### Migrations are explicit

Database migrations are intentionally run as a separate step from API startup.

This avoids unsafe behavior when multiple API containers start in parallel.

### AWS infrastructure is skeletal

Terraform exists to define the intended deployment shape, but the current priority is validating the local vertical slice before fully productionizing infrastructure.

## 10. Out of Scope for Current Version

The following are intentionally not part of the current implementation:

- OAuth and user authentication
- tenant isolation
- production usage limits
- real LLM provider integration
- notification providers
- EventBridge-based scheduling
- DAG execution
- fan-out / aggregation execution
- persistent workflow checkpoints
- distributed orchestration
- DAG editing UI

These are future layers, not current assumptions.

## 11. Future Direction

The current architecture is designed to support future growth into a more capable agent workflow platform.

Likely next steps include:

- adding authentication and per-user access control
- adding token or usage limits per user
- wiring real LLM and notification providers
- improving observability and metrics
- adding scheduled job execution
- evolving simple worker runs toward richer workflow execution

The system is intentionally starting with a narrow vertical slice before adding orchestration complexity.

## Summary

personal-agent-os currently provides a config-driven foundation for creating and running personal agent jobs.

The system demonstrates:

- config-driven form rendering
- REST-based job and run management
- API / worker separation
- shared schemas across packages
- database-backed execution state
- a clear path toward more advanced orchestration

The current focus is not a full DAG engine yet. It is a disciplined first slice that validates the platform shape before adding more complex execution models.
