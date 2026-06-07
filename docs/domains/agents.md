# Agents Domain

This document describes the implemented agents domain in the repository.

The agents domain is the configuration-owned definition layer for workflows.

It currently covers:

- shared agent definitions
- API catalog exposure
- frontend consumption for config-driven job creation
- execution-time resolution of workflow definitions for jobs and runs

It does not currently include agent authoring APIs, agent persistence management, or runtime editing of definitions.

## Scope

The agents domain spans:

- the shared `AgentDefinition` contract
- the in-repo seeded catalog of available agents
- protected API listing of available agent definitions
- lookup of definitions by `key` or `dag.id`
- frontend rendering of job-creation UI from agent configuration
- execution-time mapping from a job to its workflow definition

## Entities

### Agent Definition

The central entity is `AgentDefinition`.

Fields currently present in the shared contract:

- `id`
- `key`
- `version`
- `name`
- `description`
- `inputSchema`
- `uiSchema`
- `dag`
- `defaultSchedule`
- `alertPreferences`
- `promptTemplate`
- `tags`

An agent definition is a shared configuration artifact consumed by both the control plane and execution plane.

### Agent Key

`key` is the stable catalog identifier used by control-plane flows.

It is used for:

- API catalog lookup
- job creation
- frontend selection in the create-job flow

### Agent DAG

Each agent definition owns a DAG definition.

Relevant DAG identity fields:

- `dag.id`
- `dag.version`
- `dag.name`
- `dag.description`
- `dag.nodes`

The DAG is the execution definition associated with the agent.

### UI Schema

Each agent definition includes a `uiSchema` used by the web app to render the create-job form.

The UI schema is part of the agent definition contract, not a separate frontend-only artifact.

### Seeded Agent Catalog

The current catalog implementation is an in-memory exported array of shared definitions.

At present, the repository ships one seeded agent definition:

- `grocery-planner`

## Ownership Boundaries

### Shared Packages

Shared packages own the agent definition contract.

They are responsible for:

- the `AgentDefinition` type
- the DAG and node contract types
- the UI schema contract
- the seeded agent definitions exported from the SDK

### API

The API owns:

- exposing the current catalog through `/agents`
- catalog lookup by key
- catalog lookup by DAG ID for job and run orchestration

The API does not persist, edit, or mutate agent definitions in the current implementation.

### Frontend

The frontend owns:

- listing available agent definitions for selection
- rendering create-job UI from `uiSchema`
- using definition metadata such as `name`, `key`, `dag.id`, and `defaultSchedule`
- using the agent DAG for preview and run visualization

The frontend does not validate agent existence independently. It consumes the catalog from the API.

### Worker and Execution

Execution uses the shared seeded definitions to resolve the workflow definition for a job.

The worker owns execution of the resolved DAG, but not authorship of the definitions themselves.

## Invariants

The implementation enforces or assumes the following invariants:

- every available agent is represented as an `AgentDefinition`
- the API catalog is derived from the shared seeded definitions
- jobs are created against an existing agent definition key
- each job references a DAG ID associated with its chosen agent definition
- execution must be able to resolve a job back to an agent definition by DAG ID or key
- the create-job UI is rendered from agent `uiSchema`
- the run viewer maps jobs back to agent definitions by `dag.id` or `key`

## Business Rules

### Agent Availability

- Only definitions present in the seeded catalog are available to the application.
- There is no runtime agent creation or deletion flow.
- The API catalog is read-only.

### Job Creation

- A job must reference a known `agentDefinitionKey`.
- Job creation fails if the agent definition key is unknown.
- When a job is created, the chosen agent definition’s `dag.id` is persisted with the job.

### UI Rendering

- The create-job experience is configuration-driven from `uiSchema`.
- The selected agent’s `name` is used to shape job naming in the current UI flow.
- The selected agent’s `defaultSchedule` is used when available.

### Execution Resolution

- Queued and direct execution both resolve workflow definitions from the shared catalog.
- Resolution prefers the job’s `dagId`, with `agentDefinitionKey` available as a fallback path in parts of the system.

### Visualization

- The frontend uses the agent DAG to preview workflow structure before job creation.
- The runs UI uses the agent DAG to visualize workflow nodes and inferred edges for existing runs.

## APIs

### `GET /agents`

Purpose:

- return the current catalog of available agent definitions

Auth:

- protected

Response shape:

- `{ items: AgentDefinition[] }`

There are no implemented write APIs for agent creation, update, or deletion.

## Execution Flows

### 1. Agent Catalog Flow

1. An authenticated client calls `GET /agents`.
2. The API auth middleware verifies the request.
3. The agents controller returns the catalog from the agent catalog service.
4. The catalog service returns the shared seeded definitions.

### 2. Create Job Flow From Agent Definition

1. The frontend loads the agent catalog.
2. The user selects an available agent definition.
3. The frontend renders form fields from the selected agent’s `uiSchema`.
4. The frontend constructs job input from those form fields.
5. The frontend submits a job with:
   - `agentDefinitionKey`
   - `dagId`
   - `name`
   - `scheduleExpression`
   - `timezone`
   - `inputs`
   - `alertPreferences`
6. The API validates that the agent definition key exists.
7. The API persists the job using the selected agent’s DAG identity.

### 3. Run Resolution Flow

1. A job exists with `dagId` and optionally `agentDefinitionKey`.
2. When the system needs the workflow definition, it resolves the agent:
   - by `dagId`
   - or by `agentDefinitionKey` as fallback in some paths
3. The resolved DAG is used for execution or visualization.

### 4. Run Visualization Flow

1. The runs page loads jobs, runs, and agent definitions.
2. For each run, the frontend matches the run’s job to an agent definition by `dagId` or `key`.
3. The agent DAG is used to render node and edge structure in the workflow viewer.

## Failure Modes

### Catalog Access Failures

- unauthenticated request to `/agents`
- invalid bearer token
- disabled user attempting catalog access

Observed result:

- the same auth failures as other protected API routes

### Agent Resolution Failures

- job creation references an unknown `agentDefinitionKey`
- execution cannot resolve a workflow definition for a persisted job

Observed result:

- `404 agent_not_found` at job creation
- run execution failure when no matching definition can be resolved

### UI Consumption Failures

- frontend cannot load the protected catalog because auth is missing or invalid
- an existing run cannot be matched back to an agent definition in the current catalog

Observed result:

- create-job flow cannot initialize agent selection
- run visualization loses agent-backed workflow context for that run

## Inconsistencies and Drift

### Agent Catalog Is Shared-Code Seed Data, Not Persisted Catalog State

The runtime catalog comes from `seedAgentDefinitions` in shared code.

At the same time, the API schema includes agent-related database tables.

Those tables are not the current source of truth for available agents.

### Agent Tables Exist Without Active Catalog Ownership

The schema contains `agent_dags`, `agent_nodes`, and `job_dag_versions`, but the implemented catalog service does not read from them.

The live domain behavior is code-seeded catalog plus persisted job references, not database-backed agent management.

### `inputSchema` Exists but the Create-Job UI Is Driven by `uiSchema`

The shared contract contains both `inputSchema` and `uiSchema`.

In the implemented web flow, rendering is based on `uiSchema`, while job creation validation on the API side relies on job-level input schema rather than validating against the agent’s `inputSchema` directly in the job service.

### Jobs Persist Both `dagId` and `agentDefinitionKey`

Jobs carry both values.

That supports lookup resilience, but it also means the domain currently uses two identifiers to reconnect a job to an agent definition.

### Default Schedule Behavior Is Partly Agent-Driven and Partly UI-Driven

Agent definitions can provide `defaultSchedule`.

If one is absent, the current create-job UI falls back to a hardcoded cron expression.

That means schedule defaults are not owned entirely by the agents domain.

### Alert Preferences Exist on the Agent Contract but Are Not the Source of Job Alerts

`AgentDefinition` includes optional `alertPreferences`, but the create-job flow currently submits alert preferences assembled by the frontend rather than deriving them from the definition contract.

### Current Catalog Cardinality Is One, But the Domain Shape Is Multi-Agent

The domain contract supports multiple agents, while the current seeded implementation exposes only one definition.

This is not a problem by itself, but it is an important distinction between domain shape and current catalog contents.
