# Architecture

This document describes the architecture of `personal-agent-os`, including system design, execution model, data structures, and key design decisions.

The system is designed as a deterministic workflow engine for AI-driven tasks, using a Directed Acyclic Graph (DAG) model.

---

## 1. System Overview

At a high level, the system consists of:

- **DAG Definitions** — describe workflows as nodes and dependencies
- **Execution Engine** — runs DAGs deterministically
- **Node Runners** — execute specific node types (LLM, tool, transform, evaluator)
- **Execution State** — tracks progress, outputs, and retries
- **Tooling Layer** — external integrations and internal tools

---

## 2. Core Concepts

### DAG (Directed Acyclic Graph)

A workflow is defined as a DAG:

- nodes represent units of work
- edges represent dependencies
- execution proceeds when dependencies are satisfied

---

### Node Types

The system supports explicit node types:

#### LLM Node

- calls a language model
- structured input/output (often JSON)
- supports retry and evaluation

#### Tool Node

- executes deterministic logic or external API calls
- no model involvement
- used for side effects or data fetching

#### Transform Node

- pure function
- maps inputs to outputs
- no external calls

#### Evaluator Node

- inspects outputs of other nodes
- determines if retry or re-execution is required

---

### Execution State

Execution is tracked using a centralized state object:

- node statuses (pending, running, completed, failed)
- node outputs
- retry counts
- execution metadata (timing, logs)

---

## 3. Data Model

### Node Outputs

Node outputs are stored as immutable artifacts:

```ts
nodeOutputs: Map<nodeId, NodeResult[]>
```

Key properties:

- supports multiple outputs per node (fan-out)
- append-only
- used as the primary data source for downstream nodes

### Node Instances

For fan-out execution:

```ts
nodeInstanceId = `${nodeId}#${index}`
```

This allows:

- multiple executions per node
- independent retries
- granular observability

### Input Bindings

Nodes define how inputs are resolved:

```ts
input: {
  bindings: {
    meals: { from: "generateMeals[*].output" }
  }
}
```

Bindings allow:

- referencing prior node outputs
- mapping over multiple results
- explicit data dependencies

## 4. Execution Flow

Execution proceeds in deterministic phases:

### Phase 1: Resolve Runnable Nodes

- identify nodes whose dependencies are satisfied
- ensure stable ordering (e.g. by node id)

### Phase 2: Execute Nodes

- run all runnable nodes
- each node validates input schema
- execution is delegated to a node runner

### Phase 3: Collect Outputs

- store outputs in execution state
- append results per node instance

### Phase 4: Apply Evaluators

- evaluator nodes analyze outputs
- determine if retry is required
- schedule retries if needed

### Phase 5: Repeat Until Complete

continue until:

- all nodes complete successfully
- or retries are exhausted

## 5. Fan-Out Execution Model

The system supports a plan → execute → aggregate pattern.

### Planning Phase

An upstream node generates a list of inputs:

```txt
planStrategies → [A, B, C]
```

### Fan-Out Execution

A downstream node executes once per input:

```txt
generateMeal#0
generateMeal#1
generateMeal#2
```

Each instance:

- receives unique input
- executes independently
- produces its own output

### Aggregation Phase

A downstream node consumes all outputs:

```txt
generateMeal[*] → aggregateMeals
```

### Design Constraint

- no shared mutable state between parallel branches

coordination occurs:

- before execution (planning)
- after execution (aggregation)

## 6. Parallel Execution

The engine supports concurrent execution of independent nodes:

- nodes without dependencies can run in parallel
- fan-out instances can execute concurrently

Implementation:

```ts
await Promise.all(runnableNodes.map(runNode))
```

Constraints:

- deterministic ordering of outputs
- isolated execution per node instance

## 7. Retry Model

Retries are driven by evaluator nodes.

### Behavior

- evaluator inspects node outputs
- returns feedback indicating retry
- scheduler resets node state

### Granularity

- retries occur at the node instance level
- downstream nodes are reset if dependencies change

## 8. Design Decisions

### Deterministic Execution

The system prioritizes predictability:

- no shared mutable state
- explicit data flow
- stable execution ordering

### Explicit Data Flow

- all data is passed via node outputs
- no implicit global state
- input bindings define dependencies clearly

### Isolation of Execution

- each node instance executes independently
- failures do not affect unrelated branches

### Observability First

- all inputs/outputs are recorded
- execution is replayable
- debugging is straightforward

## 9. Out of Scope (For Now)

The following are intentionally not part of the current architecture:

- distributed execution
- persistent execution checkpoints
- DAG editing UI
- marketplace or multi-tenant systems
- long-term memory and learning systems

These will be layered on after the core execution model is fully stable.

## Summary

personal-agent-os is designed as a deterministic DAG-based execution engine with:

- explicit data flow
- isolated node execution
- fan-out and aggregation support
- evaluator-driven retries

This architecture provides a strong foundation for building reliable, observable, and scalable AI workflows.
