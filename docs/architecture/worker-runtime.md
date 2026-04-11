# Worker Runtime

This document focuses on the execution engine inside `apps/worker` and how queued jobs become completed DAG runs.

## Purpose

The worker is the workflow data plane.

Its responsibilities are:

- poll for queued runs
- claim runs safely across multiple worker instances
- resolve and execute DAG nodes
- persist node-level telemetry
- write final run output and memory
- mark failures cleanly

The worker does not own job authoring, scheduling configuration, or UI concerns.

## Runtime Modules

Current worker runtime files:

- `runtime/queue-worker.ts`
- `runtime/job-runner.ts`
- `runtime/dag-engine.ts`
- `runtime/node-runner.ts`
- `runtime/input-resolver.ts`
- `runtime/execution-state.ts`
- `runtime/retry-manager.ts`
- `runtime/planner.ts`
- `runtime/executor.ts`
- `runtime/memory.ts`

## High-Level Flow

1. API writes a `job_runs` record with status `queued`
2. Worker polls PostgreSQL for queued runs
3. Worker claims one run with row locking
4. Worker loads the job and identifies the DAG
5. Worker executes the DAG until exit output exists or execution fails
6. Worker persists step telemetry, node executions, feedback, and memory
7. Worker marks the run `succeeded` or `failed`

## Queue Claim Model

Queue claim logic lives in `queue-worker.ts`.

The worker uses:

- `FOR UPDATE SKIP LOCKED`

This gives safe multi-worker behavior:

- one queued run is claimed by only one worker
- multiple workers can poll concurrently
- blocked rows are skipped instead of causing head-of-line waiting

Current claim sequence:

1. begin transaction
2. select one queued run joined to its job
3. lock the row
4. update the run to `running`
5. commit

If no rows are available, the worker sleeps for `JOB_POLL_INTERVAL_MS`.

## Job Runner

`job-runner.ts` is the execution entrypoint after a run is claimed.

It decides between:

- DAG execution for DAG-backed jobs
- legacy single-agent execution for compatibility

For DAG-backed jobs it:

1. finds the matching `AgentDefinition`
2. calls `executeDAG(...)`
3. evaluates final output
4. builds the job memory payload
5. returns node executions and node feedback for persistence

## DAG Engine

`dag-engine.ts` is the core execution loop.

Its responsibilities are:

- maintain execution state
- determine which nodes are runnable
- resolve each node’s inputs
- run nodes
- store outputs
- apply evaluator feedback and retry rules
- terminate when the exit node has completed

### Execution State

`execution-state.ts` holds in-memory state for a single run:

- initial job inputs
- per-node outputs
- completed nodes
- running nodes
- retry counts
- retry queue

This state is intentionally local to one worker process for one run.

### Runnable Node Rules

A node is runnable when:

- it is not already completed
- it is not currently running
- all incoming `data` edges have completed
- it is an entry node or has become retry-ready

The engine does not yet support true parallel execution inside one worker process. It executes runnable nodes sequentially in the current MVP.

## Input Resolution

`input-resolver.ts` maps node inputs from:

- job inputs using `$job.someField`
- upstream node outputs using `nodeId.someField`

Examples:

- `query: "$job.zipcode"`
- `prompt: "nutrition_agent.text"`
- `budget: "$job.budget"`

This gives simple, readable wiring without adding a full expression language.

## Node Runner

`node-runner.ts` executes a single node and returns:

- structured output
- a `NodeExecution` record
- optional `NodeFeedback`

### Supported Node Types

#### Tool

- executes a registry tool directly
- current MVP primary tool is `web_search.search`

#### LLM

- uses `llm.generateText`
- currently builds a prompt from mapped inputs when needed

#### Aggregator

- merges resolved inputs into one structured output

#### Evaluator

- scores a candidate output
- returns:
  - `score`
  - `shouldRetry`
  - `summary`
- also emits `NodeFeedback`

## Retry Model

Retry behavior lives in `retry-manager.ts`.

Current behavior:

- only nodes with `retryPolicy` can retry
- evaluator output decides whether retry is needed
- feedback edges identify which node should be retried
- downstream data-dependent nodes are cleared from state
- target node is marked for retry

Supported retry strategies in the model:

- `feedback`
- `replan`

Current implementation is effectively feedback-oriented. Replan is reserved for future logic.

## Observability Model

Per-node observability is stored in `node_executions`.

Tracked fields include:

- node id
- node type
- status
- input
- output
- latency
- token usage
- retry count
- timestamps

Evaluator outputs are stored in `node_feedback`.

This creates a basic execution trace without introducing a separate event store.

## Persistence After Execution

After the in-memory DAG execution completes, `queue-worker.ts` persists:

- `job_run_steps`
- `tool_invocations`
- `node_executions`
- `node_feedback`
- `job_memories`
- final `job_runs.output`

This means the worker runtime is split into:

- transient in-memory execution state during the run
- durable relational records after each node or run phase completes

## Success Path

On success:

1. final DAG output is available at the exit node
2. evaluator summary is added to the final run output when present
3. memory is updated with latest output
4. run status becomes `succeeded`

## Failure Path

On failure:

1. error is caught in `queue-worker.ts`
2. `job_runs.status` becomes `failed`
3. `error_message` is stored

Future improvement:

- partial node failure persistence before run finalization
- richer failure categories
- dead-letter handling for repeated failures

## State Transitions

### Job Run

Run lifecycle:

- `queued`
- `running`
- `succeeded` or `failed`

### Node Execution

Node lifecycle today:

- `running`
- `succeeded`
- `retry_scheduled`
- `failed` is reserved for fuller error handling

## Concurrency Model

Current concurrency is conservative:

- inter-run concurrency comes from multiple worker instances
- intra-run concurrency is not yet parallelized

This is a deliberate MVP tradeoff:

- easier correctness
- easier observability
- simpler retry handling

Future opportunities:

- run independent DAG branches in parallel
- bounded worker pools per run
- separate concurrency policies for tool and LLM nodes

## Tool Registry

The worker uses the shared SDK tool registry.

Current tools:

- `web_search.search`
- `llm.generateText`
- `notifications.send`
- `calendar.read` stub
- `email.read` stub
- `iot.trigger` stub

This keeps node execution consistent between:

- local inline simulation
- API compatibility execution
- background worker execution

## Backward Compatibility

The worker still supports legacy single-agent execution through the compatibility path in `job-runner.ts`.

This is temporary and exists so older job shapes do not break during the migration to DAG-first workflows.

## Operational Notes

- worker startup expects PostgreSQL for queued-run processing
- the polling loop is simple and long-lived
- graceful shutdown handling should be added next
- scheduler integration is still external to the worker

## Future Enhancements

- durable per-node checkpointing mid-run
- parallel branch execution
- stronger retry semantics for `replan`
- notification dispatch after successful workflow completion
- first-class DAG snapshot loading from `job_dag_versions`
- Step Functions integration for long-running durable orchestration

