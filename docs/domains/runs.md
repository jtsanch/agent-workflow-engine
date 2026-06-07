# Runs Domain

This document describes the implemented runs domain in the repository.

The runs domain is the system of record for workflow execution attempts.

It currently covers:

- creation of manual run requests against an owned job
- retrieval of user-scoped run history
- hydration of run execution telemetry for read APIs
- asynchronous execution state transitions performed by the worker
- persistence of node-level execution artifacts

The runs domain is split across the control plane and the execution plane.

## Scope

The runs domain spans:

- API-owned queueing of new runs
- API-owned listing and retrieval of hydrated runs
- worker-owned transition from `queued` to terminal run state
- persistence of execution artifacts attached to a run
- frontend read models that present run state and DAG telemetry

The runs domain depends on:

- the jobs domain for the job that a run executes
- the agents domain for workflow-definition resolution
- the workers domain for asynchronous execution
- the usage domain for execution-time quota enforcement and usage events

## Entities

### Run

The core run entity is `JobRun`.

Relevant fields are:

- `id`
- `jobId`
- `status`
- `triggerSource`
- `startedAt`
- `completedAt`
- `output`
- `errorMessage`

The current domain status values are:

- `queued`
- `running`
- `succeeded`
- `failed`
- `cancelled`

The current trigger sources are:

- `manual`
- `schedule`
- `api`

In current implementation, new runs created through the HTTP API are always queued as `manual`.

### Hydrated Run

The API does not return a bare run for list and detail reads.

It returns a hydrated read model composed of:

- the run
- `nodeExecutions`
- `nodeFeedback`
- `toolInvocations`

This is the primary read contract used by the web application.

### Node Execution

Node execution is the main persisted execution artifact attached to a run.

Relevant fields are:

- `id`
- `jobRunId`
- `nodeId`
- `nodeType`
- `nodeVersion`
- `status`
- `input`
- `resolvedInput`
- `output`
- `errorMessage`
- `latencyMs`
- `tokenUsage`
- `retryCount`
- `startedAt`
- `completedAt`

### Node Feedback

Evaluator-style execution can attach feedback to node executions.

Relevant fields are:

- `id`
- `nodeExecutionId`
- `sourceNodeId`
- `targetNodeId`
- `score`
- `shouldRetry`
- `summary`
- `createdAt`

### Tool Invocation

Tool-node execution can attach tool invocation telemetry to a run through its node executions.

Relevant fields are:

- `id`
- `nodeExecutionId`
- `toolName`
- `request`
- `response`
- `status`
- `createdAt`

### Run-Adjacent Persistence

The run schema also includes:

- `jobRunSteps`
- `jobMemories`
- `feedbackEvents`

These are real persisted artifacts, but they are not the main public read shape of the current runs domain.

`jobMemories` are written by execution paths, but they are treated as job-level state rather than run-level output.

## Ownership Boundaries

### API Controllers

The runs controller owns the public HTTP surface for:

- listing runs
- retrieving one run
- queueing a new run

It does not own execution.

### Runs Service

`RunsService` owns the control-plane run contract:

- job ownership checks before queueing
- creation of new queued runs
- listing user-scoped runs
- hydration of run reads with execution artifacts

It is also the place where a legacy direct-execution compatibility path still exists.

### Worker Runtime

The worker owns asynchronous execution of queued runs.

That ownership includes:

- claiming queued runs
- marking them `running`
- resolving workflow definitions
- enforcing quota at execution time
- persisting node executions, tool invocations, and final run status

The worker is the source of truth for run progression after a run has been queued.

### Frontend

The web app treats runs as a read-only operational surface.

The runs page owns:

- initial loading of jobs, runs, and agents together
- mapping a run back to its job and workflow definition
- refresh of active runs when expanded
- DAG visualization from hydrated run data plus agent definition metadata

### Persistence Boundary

The API accesses runs through repository abstractions.

The worker persists run execution with direct SQL.

This means ownership is split by runtime rather than by a shared persistence abstraction.

## Invariants

The implementation enforces or assumes the following invariants:

- every run belongs to exactly one job
- run queueing requires the referenced job to exist and belong to the authenticated user
- list and detail APIs only expose runs owned by the authenticated user
- a queued run is the only kind of run the worker claims
- a claimed run is marked `running` before workflow execution begins
- successful execution can produce final run output
- failed execution records `errorMessage`
- execution telemetry is attached to a run through `jobRunId` or `nodeExecutionId`
- hydrated run reads are assembled from persisted execution artifacts rather than stored as a separate projection

The implementation also assumes that workflow resolution by `dagId` or `agentDefinitionKey` remains possible at execution time.

## Business Rules

### Queueing a Run

- New runs are created from an existing job.
- The API hides unauthorized access behind `job_not_found`.
- Queueing through the public API creates a run with status `queued`.
- Public API queueing marks `triggerSource` as `manual`.
- The run record is created before worker execution begins.

### Listing and Retrieving Runs

- `GET /runs` returns all runs visible to the authenticated user.
- `GET /runs/:runId` returns one visible run or `run_not_found`.
- Run reads are hydrated with node executions, node feedback, and tool invocations.
- The read model is intended for operational inspection rather than mutation.

### Execution Ownership

- Once a run is queued, the worker owns its lifecycle progression.
- The worker claims queued runs in ascending `started_at` order.
- Claiming uses row locking to avoid double execution.
- The worker fails the run if its workflow definition cannot be resolved.

### Quota Enforcement

- Usage counters are reset lazily when needed at execution time.
- Quota checks happen after queue claim and before workflow execution.
- If quota is exceeded, the run is failed without executing the workflow.

### Run Completion

- Successful execution writes final output and a terminal status.
- Failed execution writes a terminal status and an error message.
- Partial node-execution telemetry may still be persisted for failed runs.

## APIs

The public runs API is authenticated.

### `GET /runs`

Returns:

- `{ items: HydratedRun[] }`

Behavior:

- lists runs scoped to the authenticated user
- returns hydrated execution artifacts with each run

### `GET /runs/:runId`

Returns:

- `{ item: HydratedRun }`

Behavior:

- returns one run scoped to the authenticated user
- returns `404 run_not_found` when the run is not visible to that user

### `POST /runs`

Request body:

- `{ jobId: string }`

Returns:

- `201 { item: JobRun }`

Behavior:

- verifies that the job exists and is owned by the caller
- creates a queued run
- does not execute the run inline through the public HTTP path

## Execution Flows

### Manual Queueing Flow

1. The authenticated client calls `POST /runs` with a `jobId`.
2. The API verifies the job exists and belongs to the caller.
3. The API creates a queued run with `triggerSource = manual`.
4. The client receives the run record immediately.
5. Execution happens later in the worker.

### Worker Execution Flow

1. The worker polls for queued runs.
2. It claims one queued run and marks it `running`.
3. It reconstructs the associated job from persisted data.
4. It resolves the workflow definition from `dagId` or `agentDefinitionKey`.
5. It checks usage state and fails early if quota is exceeded.
6. It executes the DAG and persists node executions and tool invocations.
7. It writes terminal run state with either final output or an error message.

### Run Detail Read Flow

1. The client requests the run list.
2. The API loads user-scoped runs.
3. The API loads node executions for those runs.
4. The API loads node feedback and tool invocations by execution id.
5. The API returns a hydrated run model.

### Active Run Refresh Flow

1. The web runs page loads runs, jobs, and agents together.
2. When a queued or running run is expanded, the client requests `GET /runs/:runId`.
3. The refreshed hydrated run replaces the stale local copy.
4. The UI renders DAG status by combining agent DAG metadata with hydrated execution artifacts.

## Failure Modes

### Queueing Failures

- If the referenced job does not exist, the API returns `404 job_not_found`.
- If the job exists but belongs to another user, the API also returns `404 job_not_found`.
- Schema validation rejects malformed queue requests.

### Read Failures

- If a requested run is not visible to the authenticated user, the API returns `404 run_not_found`.
- If hydration dependencies are missing or inconsistent, the API returns whatever persisted data can still be grouped into the read model.

### Execution Failures

- If no workflow definition matches the queued job, the worker marks the run `failed`.
- If quota is exceeded, the worker marks the run `failed` before execution.
- If DAG execution throws, the worker marks the run `failed` and records the error message.
- If execution fails after some nodes have run, partial node-execution telemetry can still be persisted.

### Operational Gaps

- There is no public cancellation flow for runs in the current implementation.
- A queued run can exist even if later workflow resolution will fail.
- The API-created run is returned before any execution guarantee beyond queue persistence exists.

## Inconsistencies And Drift

The current implementation contains the following notable inconsistencies:

- The shared request schema used by `POST /runs` is still named `simulateRunInputSchema`, even though the public route queues a run and there is no public `/runs/simulate` endpoint.
- The API service still contains an internal `executeRun` compatibility path that performs direct execution in process. This overlaps with the worker’s execution ownership and is not the public HTTP behavior.
- The persistence schema still includes `jobRunSteps`, but the current run read model and UI are centered on `nodeExecutions`, `nodeFeedback`, and `toolInvocations`.
- The `job_runs` table includes `user_id` and `executed_by_type`, but those fields are not the primary public contract of the current runs domain.
- `RunsService.getRun` currently loads all user-visible runs and filters in memory rather than reading one run directly by scoped identifier.
- The frontend treats runs as hydrated DAG telemetry, while the underlying shared domain types still include older run-step-oriented artifacts that are no longer central to current behavior.
