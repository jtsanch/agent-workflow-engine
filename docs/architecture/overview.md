# Architecture Overview

`personal-agent-os` is a config-driven agent workflow platform. Users create recurring jobs from agent definitions, and each definition now describes a DAG-based workflow instead of a single agent step.

The current architecture is intentionally simple:

- `apps/web` is the control plane UI
- `apps/api` is the REST control plane and persistence boundary
- `apps/worker` is the workflow execution runtime
- PostgreSQL is the system of record
- EventBridge Scheduler is the intended trigger source for recurring runs

The system is designed to look like a small, readable workflow platform with room for future orchestration upgrades such as Step Functions.

For diagram views of the same architecture, see [diagrams.md](/Users/travis/projects/agent-platform/docs/architecture/diagrams.md).

## Runtime Topology

- Web is hosted from S3 behind CloudFront
- API is hosted on ECS Fargate behind an ALB
- Worker is hosted on ECS Fargate
- PostgreSQL runs on Amazon RDS
- Scheduling is reconciled to Amazon EventBridge Scheduler
- Secrets are expected in AWS Secrets Manager or SSM Parameter Store

## Layering

The backend continues to use explicit layering:

- controllers handle transport concerns
- services handle workflow and domain logic
- repositories isolate persistence
- database adapters isolate storage implementation details

This keeps DAG execution concerns in the worker runtime and keeps the API focused on configuration, scheduling, queueing, and run visibility.

## Core Domain Model

### AgentDefinition

Defines a user-selectable workflow template.

- `key`, `name`, `description`
- `inputSchema` for structured workflow inputs
- `uiSchema` for config-driven form rendering
- `dag` for execution topology
- `defaultSchedule`
- `alertPreferences`

### AgentDAG

A workflow graph with:

- `nodes`
- `edges`
- `entryNodeIds`
- `exitNodeId`

### AgentNode

Each node is one executable step in the workflow. Supported node types:

- `llm`
- `tool`
- `evaluator`
- `transform`

Important node properties:

- `agentKey`
- `inputMapping`
- `outputSchema`
- optional `retryPolicy`

### AgentEdge

Describes graph relationships.

- `data` edges move structured outputs downstream
- `feedback` edges allow evaluator nodes to trigger retries or replans

### Job

A job is the durable user-owned workflow configuration.

- `id`
- `name`
- `dagId`
- optional `agentDefinitionKey` for compatibility lookup
- `inputs`
- schedule and alerts are stored in related tables
- `status`

### JobRun

A run is one execution instance of a job.

- queued by API or scheduler
- claimed by worker
- updated to running, succeeded, or failed

### NodeExecution

Per-node execution telemetry and runtime state.

- `input`
- `output`
- `latencyMs`
- `tokenUsage`
- `retryCount`
- status and timestamps

### NodeFeedback

Structured evaluator output used to guide retries.

- `score`
- `shouldRetry`
- `summary`
- `sourceNodeId`
- `targetNodeId`

## Data Model

Current relational model spans:

- `jobs`
- `job_schedules`
- `job_alert_preferences`
- `job_runs`
- `job_run_steps`
- `tool_invocations`
- `job_memories`
- `feedback_events`
- `agent_dags`
- `agent_nodes`
- `agent_edges`
- `job_dag_versions`
- `node_executions`
- `node_feedback`

### Persistence Notes

- `jobs` now store `dag_id` and `inputs`
- DAG definitions are modeled relationally, with `agent_dags` as the root
- `job_dag_versions` is reserved for snapshotting the DAG used by a job at creation or update time
- `node_executions` captures observability for each DAG node run
- `node_feedback` stores evaluator outputs that influence retry behavior

## API Surface

The current control-plane API provides:

- `GET /health`
- `GET /ready`
- `GET /agents`
- `GET /jobs`
- `POST /jobs`
- `GET /runs`
- `POST /runs`
- `POST /runs/simulate`
- `GET /alerts`

### API Responsibilities

- expose workflow templates to the UI
- validate and persist job creation requests
- queue runs into PostgreSQL
- provide read models for jobs, runs, and alerts
- support local inline simulation for debugging

The API is intentionally not the workflow executor. It is the control plane and queue boundary.

## UI Flow

The UI remains config-driven.

### Create Job

When a user selects an agent definition:

- the UI loads the definition from `GET /agents`
- renders the dynamic input form from `uiSchema`
- shows a read-only DAG preview from `dag`
- submits a job with `dagId`, `agentDefinitionKey`, `inputs`, schedule, and alerts

### Jobs and Runs

- Jobs page shows durable job configuration and DAG identity
- Runs page shows run-level status and step visibility
- full DAG editing is explicitly out of scope for the MVP

## Execution Flow

### 1. Job Creation

1. User selects an agent definition in the web app
2. UI renders inputs and DAG preview
3. UI posts job config to `POST /jobs`
4. API validates with Zod and stores the job, schedule, and alerts

### 2. Run Queueing

Runs can be created in two ways:

- manual queueing through `POST /runs`
- scheduled queueing by EventBridge Scheduler in the future

In both cases the API creates a `job_runs` record with status `queued`.

### 3. Worker Claim

1. Worker polls PostgreSQL for queued runs
2. Worker claims one with `FOR UPDATE SKIP LOCKED`
3. Worker marks the run `running`

### 4. DAG Execution

The worker DAG engine:

1. initializes execution state from job inputs
2. finds entry nodes or retry-ready nodes
3. resolves node input mappings from job inputs and upstream outputs
4. executes runnable nodes
5. stores outputs in execution state
6. records `node_executions`
7. records `node_feedback` for evaluator nodes
8. retries downstream targets when retry policy permits
9. completes when the exit node has produced output

### 5. Completion

On success:

- worker stores final run output on `job_runs`
- worker writes `job_memories`
- worker persists step and tool telemetry

On failure:

- worker marks the run failed
- stores an error message

## DAG Runtime Behavior

### Input Resolution

Node input mappings support:

- `$job.someField` for job-level input access
- `upstreamNode.outputField` for upstream dependency access

### Node Types

#### `tool`

- deterministic integration step
- current MVP focus is `web_search.search`

#### `llm`

- reasoning or synthesis step
- currently stubbed via `llm.generateText`

#### `evaluator`

- scores an upstream output
- can trigger retry on feedback edges

#### `aggregator`

- merges structured values from multiple inputs

### Retry Model

Each node may define:

- `maxRetries`
- `strategy`

Current MVP behavior:

- evaluator output can set `shouldRetry`
- retry logic clears downstream state and re-runs targeted nodes
- more advanced replan behavior is left as a TODO

## Sample Workflow: Daily Grocery Planner

The sample DAG includes:

- `deals_agent` using `web_search.search`
- `nutrition_agent` using `llm.generateText`
- `price_agent` using `llm.generateText`
- `meal_planner` using `llm.generateText`
- `reviewer` as an evaluator

Flow:

1. `deals_agent` gathers external context
2. `nutrition_agent` and `price_agent` analyze the deal set
3. `meal_planner` synthesizes a plan
4. `reviewer` scores the result
5. feedback can send the workflow back for one refinement pass

## Backward Compatibility

The codebase still carries a compatibility path for single-agent execution:

- `Job` retains optional `agentDefinitionKey`
- API simulation can fall back to legacy execution
- worker runtime can still execute older non-DAG-shaped flows when necessary

This is transitional and intended to make the evolution safer while the DAG path becomes the primary runtime.

## Orchestration Boundary

The current orchestration model is intentionally lightweight:

- API writes queued runs
- worker claims and executes them
- PostgreSQL is the coordination layer

This keeps the MVP easy to reason about and deploy. Future upgrades may include:

- Step Functions for durable orchestration
- a dedicated scheduler reconciliation service
- higher-concurrency fan-out execution
- human-in-the-loop approval steps

## Deployment and Pipeline Notes

- migrations run as a dedicated step and are not part of API startup
- API readiness is exposed at `GET /ready`
- API liveness is exposed at `GET /health`
- worker and API can scale independently

## TODOs

- persist DAG definitions and snapshots more fully through repositories
- add first-class APIs for DAG versions and node execution inspection
- add DAG editor UI
- wire real search, calendar, email, and IoT tools
- add Step Functions integration when orchestration durability becomes a requirement
