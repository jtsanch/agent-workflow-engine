# Future Growth

This document outlines the intended evolution of `personal-agent-os` beyond its current MVP state.

The system is designed to evolve deliberately — starting from a deterministic execution engine and expanding into a scalable, composable workflow platform.

---

# Guiding Principles

All future development follows:

- **Deterministic execution first**
- **Explicit data flow over implicit behavior**
- **Observability over abstraction**
- **Composable, isolated execution units**

These principles ensure reliability as the system scales.

---

# 1. Core Execution Model

## Current State

- DAG execution is sequential within a run
- Nodes execute once per run
- Execution state is in-memory
- Basic retry exists via evaluator nodes

## Direction

Strengthen the execution engine as a deterministic dataflow system:

- stable execution ordering
- explicit execution phases:
    - resolve runnable nodes
    - execute nodes
    - collect outputs
    - apply retry scheduling
- clear node lifecycle:
    - pending → running → completed / failed
- separation of execution vs retry logic

## Goal

Ensure the system behaves predictably and is easy to reason about before introducing parallelism or scale.

---

# 2. Data Flow and Node Outputs

## Current State

- node outputs are stored per node
- downstream nodes consume prior outputs

## Direction

Evolve toward a structured dataflow model:

- node outputs support **multiple results per node**
- outputs are treated as **immutable execution artifacts**
- input bindings explicitly define data dependencies

Example:

```ts
nodeOutputs: Map<nodeId, NodeResult[]>
```

## Goal

Enable flexible composition of workflows and prepare the system for fan-out and aggregation patterns.

---

# 3. Fan-Out Execution Model

## Current State

- each node executes once per run
- nodeInstanceId === nodeId

## Direction

Introduce node instances and fan-out execution.

### A. Pre-Coordination (Planning Phase)

Upstream nodes define how work is partitioned:

- generate a list of inputs or strategies
- ensure independence between branches

Example:

planStrategies → [strategyA, strategyB, strategyC]

### B. Fan-Out (Map Phase)

A node executes once per input item:

- generateMeal#0
- generateMeal#1
- generateMeal#2

Each instance:

- receives unique input
- executes independently
- produces its own output

### C. Fan-In (Aggregation Phase)

Downstream nodes:

- consume multiple outputs
- merge results deterministically

Example:

generateMeal[*] → aggregateMeals

### Key Design Constraint

No shared mutable state between parallel branches. Coordination happens:
- before execution (planning)
- after execution (aggregation)

## Goal

Enable parallel, isolated execution while preserving determinism and simplifying reasoning.

---

# 4. Parallel Execution

## Current State

- execution is sequential within a DAG
- concurrency only exists across runs

## Direction

Enable concurrent execution of independent nodes:

- run multiple nodes in parallel when dependencies allow
- execute fan-out instances concurrently

### Implementation approach

- batch runnable nodes
- execute with controlled concurrency (e.g. Promise.all)

### Constraints

- deterministic output ordering
- no shared mutable state
- consistent retry behavior

## Goal

Reduce latency and improve resource utilization without introducing non-determinism.

---

# 5. Retry and Adaptive Planning

## Current State

- evaluator nodes can trigger retries
- retries reset downstream nodes

## Direction

### A. Instance-Level Retry

- retry individual node instances (not entire nodes)
- isolate failures within fan-out branches

### B. Conditional Execution

- support branching based on runtime results
- allow dynamic execution paths within DAGs

### C. Replanning

- evaluator nodes can trigger upstream re-execution
- workflows adapt based on intermediate results

Example:

plan → execute → evaluate → replan → execute

## Goal

Move from static workflows to adaptive, feedback-driven execution.

---

# 6. Observability and Debugging

## Current State

- basic node-level telemetry
- append-only execution logs

## Direction

- visualize DAG execution (including fan-out branches)
- step-by-step replay of runs
- inspect inputs/outputs per node instance
- track retries and failures
- performance metrics per node and workflow

## Goal

Make the system transparent, debuggable, and production-ready.

---

# 7. DAG Authoring and Editing

## Current State

- DAGs are defined in code
- no direct editing capability

## Direction

- visual DAG editor
- schema-driven node configuration
- validation of:
  - input/output compatibility
  - dependency correctness
  - cycle detection

## Goal

Allow users to create, modify, and reuse workflows without code changes.

---

# 8. Platform and Ecosystem

## Current State

- internal tool registry
- shared API access

## Direction

### A. Extensible Tooling

- pluggable tool registry
- user-defined tools
- external integrations
- user-specific credentials

### B. Workflow Sharing

- reusable templates
- versioning and tracking
- sharing across users or teams

### C. Multi-Tenant Support

- isolation between users
- access control and permissions

## Goal

Evolve into a flexible platform for building and sharing workflows.

---

# 9. Execution at Scale

## Current State

- execution occurs in a single process
- no persistence or distribution

## Direction

- distributed execution across workers
- persisted execution state
- queue-based orchestration
- checkpointing and recovery

### Potential approaches

- queue workers for fan-out
- orchestration frameworks (e.g. Step Functions)
- hybrid local/distributed execution

## Goal

Support large-scale, long-running workflows reliably.

---

# 10. Memory and Learning

## Current State

- basic job memory stored post-run

## Direction

### A. Persistent Context

- workflows accumulate knowledge over time
- user- or job-specific memory

### B. Feedback Loops

- evaluator results influence future runs
- tuning prompts or parameters automatically

### C. Retrieval-Augmented Workflows

- nodes query stored knowledge
- enrich inputs dynamically

## Goal

Enable workflows to improve over time and leverage historical context.

---

# 11. Human in the Loop

## Current State

- workflows are fully automated
- no interaction during execution

## Direction

- allow pausing at specific nodes
- support manual input or approvals
- integrate notifications and interaction channels

## Goal

Introduce controlled human intervention where automation is insufficient.

---

# Summary

The system is evolving from:

- single-instance, sequential workflows

into:

- parallel, fan-out capable, adaptive execution systems

while preserving:

- determinism
- observability
- explicit data flow

This foundation enables scalable, reliable orchestration for AI-driven workflows.
