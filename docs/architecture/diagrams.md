# Diagrams

This document provides visual representations of the `personal-agent-os` architecture and execution model.

Diagrams are intentionally kept simple and conceptual. They complement the Architecture document rather than replace it.

---

# 1. System Architecture

```text
        ┌──────────────┐
        │     Web      │
        │ (apps/web)   │
        └──────┬───────┘
               │
               ▼
        ┌──────────────┐
        │     API      │
        │ (apps/api)   │
        └──────┬───────┘
               │
       ┌───────┴────────┐
       ▼                ▼
┌──────────────┐  ┌──────────────┐
│ PostgreSQL   │  │ Scheduler    │
│ (RDS)        │  │ (EventBridge)│
└──────┬───────┘  └──────────────┘
       │
       ▼
┌──────────────┐
│   Worker     │
│ (apps/worker)│
└──────────────┘
```

### Notes

* API acts as the control plane
* Worker acts as the execution engine
* PostgreSQL is the system of record
* Scheduler triggers recurring runs

---

# 2. DAG Definition vs Execution

```text
AgentDefinition
      │
      ▼
AgentDAG (nodes only)
      │
      ▼
Bindings (implicit dependencies)
      │
      ▼
Compiled DAG (internal)
      │
      ▼
ExecutionState (per run)
      │
      ▼
Worker Execution
```

### Key Idea

* DAG definitions do NOT include edges
* dependencies are inferred from bindings
* graph is compiled internally for execution

---

# 3. Compiled Graph Model

```text
Nodes:
  A, B, C

Bindings:
  A → B
  B → C

Compiled Graph:

forward:
  A → [B]
  B → [C]
  C → []

reverse:
  A → []
  B → [A]
  C → [B]
```

### Notes

* `forward` supports downstream traversal
* `reverse` supports dependency resolution
* graph is immutable during execution

---

# 4. DAG Execution Flow

```text
[Initialize]
     │
     ▼
[Find Runnable Nodes]
     │
     ▼
[Resolve Inputs]
     │
     ▼
[Execute Node]
     │
     ▼
[Append Output]
     │
     ▼
[Check Evaluator]
     │
     ▼
[Retry?] ────── Yes ─────► Reset downstream nodes
     │
     No
     ▼
[More Runnable Nodes?]
     │
     ▼
    Yes ─────► Continue
     │
     No
     ▼
[All Exit Nodes Complete]
     │
     ▼
[Finish Run]
```

---

# 5. Retry / Rewind Model

```text
A → B → C → D

Evaluator triggers retry of B

Result:

A (unchanged)
B (retry++)
C (reset → pending)
D (reset → pending)

Outputs:
- NOT deleted
- new outputs appended on re-execution
```

### Key Idea

* retries invalidate execution, not history
* append-only outputs preserve full trace

---

# 6. Node Execution Model

```text
Node Instance:

Input
  │
  ▼
Execute (tool / llm / transform / evaluator)
  │
  ▼
Output Entry (append-only)

[
  { success: false, ... },
  { success: true, ... }
]
```

### Notes

* each node instance maintains full history
* latest successful output is derived
* retries append, never overwrite

---

# 7. Future: Fan-Out Model (Planned)

```text
generateItems
     │
     ▼
itemProcessor#0
itemProcessor#1
itemProcessor#2
     │
     ▼
aggregateResults
```

### Notes

* each node instance runs independently
* execution state tracks instances separately
* aggregation nodes combine outputs

---

# 8. Execution Layers

```text
Definition Layer
  - AgentDefinition
  - AgentDAG

Compiled Layer
  - nodeMap
  - graph (forward / reverse)

Runtime Layer
  - ExecutionState
  - nodeOutputs
  - runtime status

Persistence Layer
  - job_runs
  - node_executions
  - node_feedback
```

---

# Summary

These diagrams illustrate the key ideas:

* workflows are node-based, not edge-defined
* dependencies come from bindings
* execution is driven by a compiled graph
* outputs are append-only
* retries reset execution, not history

This model enables a system that is:

* deterministic
* observable
* extensible
