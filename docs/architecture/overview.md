# Architecture Overview

`personal-agent-os` is a config-driven workflow platform for running structured AI agents as repeatable jobs.

The system is designed around a clear separation of concerns:

* **Control Plane** → defines and schedules workflows
* **Data Plane (Worker)** → executes workflows deterministically

The architecture intentionally prioritizes:

* simplicity
* observability
* deterministic execution
* extensibility for future orchestration features

---

# System Overview

## Components

* **Web (`apps/web`)**

    * Config-driven UI for creating and viewing jobs
    * Renders workflows from definitions

* **API (`apps/api`)**

    * Control plane for:

        * job creation
        * run queueing
        * configuration validation
    * Persists system state to PostgreSQL

* **Worker (`apps/worker`)**

    * Executes DAG workflows
    * Maintains in-memory execution state per run
    * Persists execution telemetry

* **PostgreSQL**

    * System of record for:

        * jobs
        * runs
        * execution history
        * DAG definitions

* **Scheduler (EventBridge - planned)**

    * Triggers recurring job runs

---

# Core Data Models

## AgentDefinition

Defines a reusable workflow template.

* metadata (`key`, `name`, `description`)
* `inputSchema` (structured inputs)
* `uiSchema` (form rendering)
* `dag` (execution definition)

---

## AgentDAG

Defines workflow structure.

```ts
type AgentDAG = {
  nodes: AgentNode[];
};
```

Important:

* DAGs do **not** define edges
* Dependencies are inferred from node input bindings

---

## AgentNode

Represents a single execution step.

Supported types:

* `tool`
* `llm`
* `evaluator`
* `transform`

Each node defines:

* input bindings
* output schema
* optional retry policy

---

## ExecutionState

Represents the **runtime state of a single DAG run**.

It tracks:

* node runtime status (`pending`, `running`, `completed`)
* retry counts
* append-only array `nodeOutputs`
    * full execution history for each node instance
    * append-only for immutability and observability
* nodeInstances (future fan-out support, eg: run multiple instances of a node in parallel)
    * Currently, each node has a single instance per run so `nodeInstanceId === nodeId`
* initial job input
    * immutable reference input for the DAG
* final output (derived from exit nodes with no downstream dependencies)

Key takeaways:
> ExecutionState is **purely dynamic** and contains no static DAG structure.
> This separation allows us to keep execution logic cleanly decoupled from DAG definition.
> Currently stored in-memory for simplicity, but can be persisted if needed for durability or distributed execution.

---

## NodeOutputs (Append-Only)

Each nodeInstance stores execution history:

```ts
nodeOutputs: {
  [nodeInstanceId]: [
    {
      data,
      artifacts,
      success,
      timestamp,
      error
    }
  ]
}
```

Key invariants:
* outputs are never deleted
* retries append new entries
* node instance outputs are ordered chronologically
* node instance runs are single-threaded (no concurrent executions of the same node instance)

Key takeaways:
> This design simplifies retry logic and provides observability into full execution history.
> Append-only full history enables strong audit trails and post-mortem analysis
> Rich future features are enabled by this design, such as: advanced analytics, debugging, LLM tuning, and potential rollbacks or time-travel queries.

---

# DAG Execution Model

## Bindings Define the Graph

Node input bindings define both:

* **data flow**
   * Where data comes from (job input or other node outputs)
* **execution dependencies**
   * Node depends on the completion of any nodes it references in its input bindings
* **logical edges** (implicitly)
   * No explicit edge definitions are needed; the graph structure is derived from bindings

* Example binding:

```ts
{
  key: "meals",
  ref: {
    source: "node_output",
    nodeId: "generateMeals"
  }
}
```

This implies that the current node depends on the output of `generateMeals`, creating a logical edge in the DAG:

```text
generateMeals → currentNode
```

---

## Compiled DAG (Internal)

At runtime, the system compiles the DAG into an optimized structure:

```ts
type CompiledDAG = {
  nodeMap: Map<NodeId, AgentNode>;
  graph: {
    forward: Record<NodeId, Set<NodeId>>;
    reverse: Record<NodeId, Set<NodeId>>;
  };
};
```

* `forward` → downstream traversal
* `reverse` → dependency resolution
* `nodeMap` → O(1) node lookup

This graph is:

* derived from bindings
* immutable
* in memory cached and reused across runs
* not persisted (can be recompiled from DAG definition if needed)

Key takeaways:
> The Compiled DAG provides an efficient runtime representation for scheduling and execution.
> It abstracts away the complexity of dependency resolution and allows for fast lookups during execution.

---

## Job Execution Flow

This is the heart of our DAG execution model, which consists of several key phases:

### 1. Initialization

* load job input
* compile DAG (or load from cache)
* initialize ExecutionState

---

### 2. Scheduling

A node is runnable when:

* it is not completed
* it is not currently running
* all dependencies (from `graph.reverse`) are completed

Entry nodes emerge naturally:

* nodes with no dependencies are immediately runnable

---

### 3. Execution

For each runnable node:

1. resolve input bindings
2. execute node
3. append output to nodeOutputs
4. update runtime state
5. record telemetry

---

### 4. Retry (Evaluator-Driven)

* evaluator nodes produce structured feedback
* feedback identifies a target node
* target node retry count increments
* downstream nodes are reset to `pending`
* outputs are **not deleted**, append-only history is preserved

---

### 5. Completion

The DAG completes when:

> All exit nodes are completed

Exit nodes are defined as:

* nodes with no downstream dependents (`graph.forward[nodeId].length === 0`)

---

# Worker Runtime Flow

1. API inserts `job_runs` record (`queued`)
2. Worker polls database
3. Worker claims run (`FOR UPDATE SKIP LOCKED`)
4. Worker executes DAG
5. Worker persists:

    * node executions
    * feedback
    * tool calls
    * final output
6. Run marked `succeeded` or `failed`

---

# Design Decisions

## 1. No Explicit Edges in DAG

The dag structure is derived entirely from the definition's nodes and their input bindings.

* avoids duplication (edges vs bindings)
* reduces config complexity
* keeps DAG definition declarative

---

## 2. Compiled Graph Layer

We compile the DAG into an optimized in-memory structure for execution.

* avoids runtime scanning
* enables O(1) lookups
* clean separation of structure vs execution

---

## 3. Append-Only Outputs

We never delete or mutate existing outputs; we only append new entries for retries.

* preserves full execution history
* simplifies retry logic
* improves observability

---

## 4. Separation of Concerns

We break up the workflow model into distinct layers.

* DAG definition: static structure defined by the user
* compiled graph: optimized runtime representation derived from the definition for internal engine use
* execution state: dynamic state of a single run, tracking progress and outputs without mutating the original DAG structure

---

## 5. Evaluator-Driven Retry

Evaluators produce structured feedback that drives retries of target nodes and ensures downstream nodes are reset.

* enables structured refinement loops
* keeps retry logic declarative
* supports future replan strategies
* prevents stale data issues by ensuring downstream nodes are re-executed with fresh data after an upstream retry


## 6. In-Memory Execution State

Execution state is currently stored in memory for simplicity and performance.

* allows for fast access and updates during execution
* simplifies implementation without needing to persist intermediate state
* can be extended to support persistence if needed for durability or distributed execution in the future

## 7. Node Execution Ids
During execution, nodes from the DAG are created as "node instances" with unique `nodeInstanceId`s.

* Currently, each node has a single instance per run, so `nodeInstanceId === nodeId`
* Future fan-out support will allow multiple instances of the same node to run in parallel, each with its own nodeInstanceId

## 8. Single-Threaded Node Execution
Each node instance is executed in a single-threaded manner, meaning that retries of the same node instance will not run concurrently.

* This simplifies the execution model and avoids issues with concurrent mutations of node outputs
* Ensures node-instances are core units of execution and retry, with clear boundaries and state management
* Enforces parallel execution to be defined in the DAG structure (eg: fan-out nodes w/ multiple instances) rather than through concurrent execution of the same node instance

---

# Tradeoffs

Current system intentionally limits:

* no parallel execution within a run
* no fan-out support yet
* in-memory graph cache only
* simple scheduling model
* no distributed execution
* no advanced retry strategies (eg: replan)
* no DAG editor UI
* no DAG version snapshot loading
* no support for dynamic DAG modifications at runtime

These choices prioritize:

* correctness
* debuggability
* fast iteration
* MVP feature set
* a solid foundation for future extensibility

---

# Out of Scope

Planned but not yet implemented:

## Near Term:
* DAG editor UI for runtime DAG creation and visualization
* fan-out / multi-instance nodes
* dynamic DAG modifications at runtime
* DAG version snapshot loading
* advanced retry strategies (replan)

## Further out
* Distributed execution model
* Scheduler for recurring jobs (eg: EventBridge integration)
* Shared data state across runs (e.g. for memory, learning features, LLM tuning)
* Caching of node outputs across runs (eg: for deterministic nodes or memoization)
* Advanced analytics and debugging tools leveraging the append-only execution history (eg: time-travel queries, execution replay, LLM tuning based on past runs)

---

# Summary

The system models workflows as:

* declarative node definitions
* binding-driven dependencies
* compiled execution graphs
* append-only execution history

This creates a foundation that is:

* easy to reason about
* observable
* extensible toward more advanced orchestration features
