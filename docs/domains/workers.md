# Workers Domain

This document describes the implemented workers domain in the repository.

The workers domain is the execution-plane runtime for queued workflow runs.

It currently covers:

- polling for queued runs
- claiming and marking runs as running
- resolving jobs to workflow definitions
- DAG execution
- usage-limit enforcement at execution time
- persistence of runtime telemetry, final output, and usage events

It does not expose an HTTP API of its own.

## Scope

The workers domain spans:

- the worker process bootstrap loop
- queue claiming from PostgreSQL
- workflow execution against a persisted job
- persistence of node execution telemetry, tool invocations, job memory, and usage events
- worker-owned failure handling for queued runs

The worker depends on:

- the jobs domain for persisted jobs
- the agents domain for workflow definitions
- the usage domain for quota state and usage-event persistence
- the shared runtime contracts for DAG and node semantics

## Entities

### Worker Process

The top-level worker runtime is a long-running polling process.

It is configured with:

- `dbDriver`
- `databaseUrl`
- `jobPollIntervalMs`
- `workerConcurrency`

### Queued Run

The worker operates on persisted run records whose status is `queued`.

The queue-claim path hydrates:

- `runId`
- the associated `job`

The worker treats the run as the execution unit it claims and finalizes.

### Job Snapshot Used By Worker

The queue-claim query reconstructs the job information the worker needs:

- `id`
- `userId`
- `dagId`
- `agentDefinitionKey`
- `name`
- `status`
- `inputs`
- timestamps

This is not a separate stored entity, but it is the worker’s effective execution payload.

### Execution State

Execution state is the in-memory runtime state for one DAG run.

It tracks:

- job input
- node runtime status
- retry counts
- node instances
- append-only node output entries

Execution state is runtime-local and per-run.

### Compiled DAG

The worker compiles DAG definitions into an internal graph structure with:

- nodes
- `nodeMap`
- forward graph
- reverse graph

This is the scheduling representation used during execution.

### Node Execution

Node execution telemetry is a persisted execution artifact for each node run.

Relevant fields:

- `id`
- `jobRunId`
- `nodeId`
- `nodeType`
- `nodeVersion`
- `status`
- `resolvedInput`
- `output`
- `errorMessage`
- `latencyMs`
- `tokenUsage`
- `retryCount`
- timestamps

### Node Feedback

Evaluator-style nodes can produce node feedback.

Relevant fields:

- `id`
- `nodeExecutionId`
- `sourceNodeId`
- `targetNodeId`
- `score`
- `shouldRetry`
- `summary`
- `createdAt`

### Tool Invocation

Tool-node execution can emit tool invocation records.

Relevant fields:

- `id`
- `nodeExecutionId`
- `toolName`
- `request`
- `response`
- `status`
- `createdAt`

### Job Memory

The worker persists memory records in `job_memories`.

In current implementation, this is used for persisted memory writes from the execution result, but the active DAG engine currently returns no memory writes.

### Usage State

The worker reads and updates user usage state at execution time.

Relevant worker-owned concerns:

- usage limits
- usage counters
- usage events written after execution

## Ownership Boundaries

### Worker Bootstrap

The worker bootstrap owns:

- loading worker configuration
- establishing the Postgres connection pool
- starting the polling loop

It does not own HTTP-facing concerns or control-plane orchestration.

### Queue Worker

`queue-worker` owns:

- finding queued runs
- claiming a single queued run
- marking the run `running`
- loading quota state
- invoking execution
- persisting completion or failure state

This is the operational center of the worker domain.

### Job Runner

`job-runner` owns:

- resolving a job to an agent definition
- creating execution context
- compiling or loading a compiled DAG
- delegating to the DAG engine

### DAG Engine

The DAG engine owns:

- DAG validation
- dependency-driven scheduling
- node execution order
- retry scheduling
- node-level telemetry assembly

### Persistence Boundary

The worker persists directly with SQL through the queue worker.

Unlike the API, the worker does not use repository abstractions for its main persistence path.

## Invariants

The implementation enforces or assumes the following invariants:

- the worker is intended to process queued runs only when `DB_DRIVER=postgres`
- a run must be claimed before it is executed
- queue claim is single-run and uses row-level locking semantics
- execution requires the job to resolve to a known workflow definition
- usage limits are checked before execution begins
- node outputs are append-only in execution state
- retries preserve execution history instead of overwriting it
- workflow dependencies are derived from node input bindings
- final run completion persists run status and output

## Business Rules

### Queue Processing

- The worker polls continuously.
- If no queued run is available, it sleeps for the configured interval.
- The worker claims at most one run per polling iteration.

### Run Claiming

- Queued runs are selected in ascending `started_at` order.
- Claiming uses `FOR UPDATE SKIP LOCKED`.
- A claimed run is immediately marked `running`.

### Workflow Resolution

- The worker resolves a workflow definition using the job’s `dagId` or `agentDefinitionKey`.
- If no matching agent definition exists, the run is failed.

### Quota Enforcement

- Usage counters are lazily reset before execution when needed.
- The worker checks daily and monthly quotas before running the job.
- If quota is exceeded, the run is failed without executing the workflow.

### DAG Execution

- Execution is dependency-driven from input bindings.
- Runnable nodes are selected when all dependencies are completed.
- Node execution is effectively sequential within a run in the current implementation.
- Retry-capable failures can become `retry_scheduled`.
- Evaluator feedback can clear downstream runtime state and cause re-execution.

### Persistence After Execution

- Successful execution persists:
  - node executions
  - tool invocations
  - job memories
  - usage events
  - updated usage counters
  - final run status and output
- Failed execution persists:
  - failed run status
  - error message
  - partial node execution telemetry when available

## APIs

The workers domain does not expose public HTTP APIs.

Its effective internal interfaces are function-based:

- worker bootstrap entrypoint
- queue processing entrypoint
- job runner entrypoint
- DAG execution entrypoint

The main operational entrypoint is:

- `processNextQueuedRun(pool)`

The main execution entrypoint is:

- `runJob(job)`

The main workflow engine entrypoint is:

- `executeDAG(dagOrCompiledDag, inputs, jobRunId, context)`

## Execution Flows

### 1. Worker Startup Flow

1. The worker loads configuration from environment.
2. If the configured database driver is not Postgres, the worker logs a warning and exits.
3. The worker creates a Postgres pool.
4. The worker enters an infinite polling loop.

### 2. Queue Claim Flow

1. The worker starts a database transaction.
2. It selects the earliest queued run joined with its job.
3. The row is locked with `FOR UPDATE SKIP LOCKED`.
4. If no row is found, the transaction rolls back and the worker reports no work.
5. If a row is found, the run is updated to `running`.
6. The transaction commits.
7. The worker proceeds with the claimed run and reconstructed job payload.

### 3. Pre-Execution Quota Flow

1. The worker loads usage counters and limits for the job owner.
2. It lazily resets counters if the day or month boundary has passed.
3. It checks whether the current usage already exceeds limit thresholds.
4. If quota is exceeded, the run is failed with `Quota exceeded` and execution does not start.

### 4. Job Execution Flow

1. The worker resolves the job to an agent definition.
2. The job runner builds execution context, including:
   - tool registry
   - clock
   - logger
   - LLM budget
3. The DAG is compiled or fetched from cache.
4. The DAG engine validates the DAG.
5. Execution state is initialized.
6. Runnable nodes are discovered from dependency satisfaction.
7. Each runnable node is executed.
8. Node outputs, feedback, and usage events are collected.
9. Evaluator feedback may trigger retry scheduling.
10. The run completes when all terminal nodes are completed.

### 5. Successful Completion Flow

1. Node executions are persisted.
2. Tool invocations are persisted.
3. Memory writes are persisted to `job_memories`.
4. Usage events are prepared for insertion.
5. A final transaction inserts usage events, increments counters, and marks the run `succeeded`.
6. Final output is stored on the run record.

### 6. Failure Flow

1. Any thrown execution error is captured by the queue worker.
2. The run is marked for failure.
3. If the error is a `DAGExecutionError`, partial node execution telemetry is persisted.
4. The worker finalizes the run as `failed` with an error message.

## Failure Modes

### Startup and Configuration Failures

- invalid worker environment variables
- non-Postgres database driver for real queue processing
- database connection issues

Observed result:

- startup failure
- or warning plus early exit when not using Postgres

### Queue Failures

- SQL error while claiming a run
- malformed queued row or missing joined job data

Observed result:

- claim transaction rollback
- thrown worker error

### Workflow Resolution Failures

- claimed job references unknown `dagId` and unknown `agentDefinitionKey`

Observed result:

- run is marked `failed`
- error message indicates unknown workflow definition

### Quota Failures

- usage state cannot be loaded
- usage limits are already exceeded before execution

Observed result:

- worker throws when usage state is missing
- or the run is failed with `Quota exceeded`

### DAG Execution Failures

- invalid DAG structure
- unsupported data reference behavior
- node execution failure beyond retry limit
- write conflicts across runnable nodes

Observed result:

- thrown execution error
- failed run
- partial execution telemetry may still be persisted

### Persistence Finalization Failures

- usage event insert fails
- run finalization update fails
- completion transaction errors

Observed result:

- rollback of the finalization transaction
- error logged by the worker
- previously written intermediate telemetry may already exist

## Inconsistencies and Drift

### `WORKER_CONCURRENCY` Is Configured but Not Enforced

The worker loads and logs `workerConcurrency`, but the polling loop processes one claimed run at a time.

The configuration exists, but current runtime behavior is single-run polling.

### Queue Worker Uses Direct SQL Instead of API-Style Repositories

The API uses repository abstractions for persistence, while the worker performs direct SQL writes for its main flow.

This is an intentional implementation split, but it creates two persistence styles across the codebase.

### Worker Requires Postgres Even Though Config Allows `memory`

The worker configuration schema accepts `memory`, but the real queue-processing path exits unless the driver is Postgres.

So the configuration contract is broader than actual operational behavior.

### Fan-Out Exists in Type Shape but Is Not Supported

Execution state and shared node-instance contracts suggest future support for multiple node instances.

Current runtime behavior throws for multiple node instances with `Fan out not supported`.

### Memory References Are Declared but Not Supported

The shared data-reference contract includes `memory`, but the worker input resolver throws `Memory not supported yet`.

The worker can persist `memoryWrites` from execution results, but the active DAG engine currently returns an empty `memoryWrites` array.

### In-Run Execution Is Sequential Despite Batch Terminology

The DAG engine groups runnable nodes conceptually, but it executes them in a sequential loop.

Independent nodes are not run concurrently within a single workflow run today.

### Worker and API Both Contain Execution Logic Paths

The worker is the intended asynchronous execution owner, but the API still contains a compatibility execution path in `RunsService.executeRun`.

That means execution semantics exist in both runtimes, even though the worker is the production queue processor.

### Usage Quota Check Happens Before New Usage Is Added

The worker checks whether current counters already exceed limits before execution begins.

The current flow does not compare predicted usage for the upcoming run against remaining allowance before starting the run.

This is current behavior, not a broader quota policy contract.
