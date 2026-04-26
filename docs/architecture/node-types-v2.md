# Agent DAG v2

## Goals

This version of the DAG model is designed to improve:

* typed node-to-node data flow
* runtime schema safety
* reproducibility and replay
* separation of definition vs execution concerns
* clean schema evolution over time
* future support for branching, memory, caching, and richer artifacts

---

# Part 1: Recommended v2 Type Model

```ts
import type { UiFormSchema } from "@personal-agent-os/ui-schema";

export type EntityId = string;
export type Timestamp = string;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type JobStatus = "active" | "paused" | "disabled";
export type JobRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type NodeExecutionStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "retry_scheduled"
  | "cancelled";

export type AlertChannel = "email" | "slack" | "push";

export type AgentNodeType =
  | "llm"
  | "tool"
  | "transform"
  | "evaluator"
  | "condition";

export type AgentEdgeType = "data" | "feedback" | "control" | "context";

export type JsonSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array"
  | "null";

export interface JSONSchema<T = unknown> {
  $id?: string;
  version?: string;
  title?: string;
  description?: string;
  type?: JsonSchemaType | JsonSchemaType[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  additionalProperties?: boolean | JSONSchema;
  enum?: readonly unknown[];
  const?: unknown;
  default?: unknown;
  nullable?: boolean;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  format?: string;
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  definitions?: Record<string, JSONSchema>;
}

export interface SchemaRef {
  id: string;
  version: string;
}

export interface RetryPolicy {
  maxRetries: number;
  strategy: "regenerate" | "rerun" | "feedback_adjust";
  backoffMs?: number;
}

export interface CachePolicy {
  enabled: boolean;
  keyTemplate?: string;
  ttlSeconds?: number;
}

export interface ExecutionPolicy {
  timeoutMs?: number;
  retryPolicy?: RetryPolicy;
  cachePolicy?: CachePolicy;
  concurrencyKey?: string;
  priority?: number;
}

export type DataRef =
  | { source: "job_input"; path?: string }
  | { source: "node_output"; nodeId: string; path?: string }
  | { source: "memory"; key: string; path?: string }
  | { source: "static"; value: JsonValue }
  | { source: "context"; path: string };

export type InputBinding<TInput extends JsonObject = JsonObject> = {
  [K in keyof TInput]?: DataRef;
};

export interface NodeInputContract<TInput = JsonObject> {
  schema: JSONSchema<TInput>;
  bindings: InputBinding<Extract<TInput, JsonObject>>;
}

export interface Artifact {
  id: string;
  kind: "text" | "json" | "file" | "image" | "table";
  name?: string;
  mimeType?: string;
  uri?: string;
  inline?: JsonValue;
  metadata?: Record<string, JsonValue>;
}

export interface NodeOutputEnvelope<TOutput = JsonObject> {
  data: TOutput;
  artifacts?: Artifact[];
  metadata?: Record<string, JsonValue>;
}

export interface OutputContract<TOutput = JsonObject> {
  schema: JSONSchema<TOutput>;
  outputKind?: "structured" | "text" | "plan" | "decision" | "critique";
}

export interface BaseNode<TInput = JsonObject, TOutput = JsonObject> {
  id: string;
  version: string;
  type: AgentNodeType;
  name: string;
  description?: string;
  deterministic?: boolean;
  input: NodeInputContract<TInput>;
  output: OutputContract<TOutput>;
  execution?: ExecutionPolicy;
  tags?: string[];
}

export interface ToolNode<TInput = JsonObject, TOutput = JsonObject>
  extends BaseNode<TInput, TOutput> {
  type: "tool";
  toolName: string;
  toolVersion?: string;
}

export interface TransformNode<TInput = JsonObject, TOutput = JsonObject>
  extends BaseNode<TInput, TOutput> {
  type: "transform";
  transformName: string;
  transformVersion?: string;
}

export interface LLMOutputConfig<TOutput = JsonObject> {
  schema: JSONSchema<TOutput>;
  enforcement: "strict" | "best_effort";
}

export interface LLMNode<TInput = JsonObject, TOutput = JsonObject>
  extends BaseNode<TInput, TOutput> {
  type: "llm";
  promptTemplate: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  outputConfig: LLMOutputConfig<TOutput>;
}

export interface EvaluationSignal {
  retry: boolean;
  strategy?: "regenerate" | "rerun" | "feedback_adjust";
  targetNodeId?: string;
}

export interface EvaluationResult {
  score: number;
  passed: boolean;
  issues: string[];
  summary: string;
  signal?: EvaluationSignal;
}

export interface EvaluatorNode<TInput = JsonObject>
  extends BaseNode<TInput, EvaluationResult> {
  type: "evaluator";
  promptTemplate: string;
  model?: string;
  temperature?: number;
}

export interface ConditionBranch {
  when: string;
  toNodeId: string;
}

export interface ConditionNode<TInput = JsonObject>
  extends BaseNode<TInput, { selectedBranch: string }> {
  type: "condition";
  conditionLanguage: "jsonpath" | "expression";
  branches: ConditionBranch[];
  defaultToNodeId?: string;
}

export type AgentNode =
  | ToolNode
  | TransformNode
  | LLMNode
  | EvaluatorNode
  | ConditionNode;

export interface AgentEdge {
  id: string;
  from: string;
  to: string;
  type: AgentEdgeType;
  label?: string;
}

export interface AgentDAG {
  id: string;
  version: string;
  name: string;
  description?: string;
  nodes: AgentNode[];
  edges: AgentEdge[];
}

export interface AlertPreference {
  id: string;
  jobId?: EntityId;
  channel: AlertChannel;
  destination: string;
  onSuccess: boolean;
  onFailure: boolean;
}

export interface AgentDefinition {
  id: string;
  key: string;
  version: string;
  name: string;
  description: string;
  inputSchema: JSONSchema;
  uiSchema: UiFormSchema;
  dag: AgentDAG;
  defaultSchedule?: string;
  alertPreferences?: AlertPreference[];
  tags?: string[];
}

export interface Job {
  id: EntityId;
  userId: EntityId;
  name: string;
  dagId: string;
  agentDefinitionKey?: string;
  status: JobStatus;
  inputs: JsonObject;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface JobSchedule {
  id: EntityId;
  jobId: EntityId;
  scheduleExpression: string;
  timezone: string;
  enabled: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface JobRunBudget {
  maxTokens?: number;
  consumedTokens?: number;
  maxCostUsd?: number;
  consumedCostUsd?: number;
}

export interface JobRun {
  id: EntityId;
  jobId: EntityId;
  status: JobRunStatus;
  triggerSource: "manual" | "schedule" | "api";
  startedAt: Timestamp;
  completedAt?: Timestamp;
  output?: NodeOutputEnvelope;
  errorMessage?: string;
  budget?: JobRunBudget;
}

export interface NodeExecution {
  id: EntityId;
  jobRunId: EntityId;
  nodeId: string;
  nodeVersion: string;
  nodeType: AgentNodeType;
  status: NodeExecutionStatus;
  resolvedInput: JsonObject;
  output?: NodeOutputEnvelope;
  errorMessage?: string;
  latencyMs?: number;
  tokenUsage?: number;
  costUsd?: number;
  retryCount: number;
  startedAt: Timestamp;
  completedAt?: Timestamp;
}

export interface ToolInvocation {
  id: EntityId;
  nodeExecutionId: EntityId;
  toolName: string;
  toolVersion?: string;
  request: JsonObject;
  response?: JsonObject;
  status: "pending" | "succeeded" | "failed";
  createdAt: Timestamp;
}

export interface NodeFeedback {
  id: EntityId;
  jobRunId: EntityId;
  sourceNodeId: string;
  targetNodeId: string;
  score: number;
  shouldRetry: boolean;
  summary: string;
  createdAt: Timestamp;
}

export interface JobMemoryEntry {
  id: EntityId;
  jobId: EntityId;
  key: string;
  value: JsonValue;
  updatedAt: Timestamp;
}

export interface FeedbackEvent {
  id: EntityId;
  jobId: EntityId;
  jobRunId?: EntityId;
  score: number;
  comment?: string;
  createdAt: Timestamp;
}

export interface UserContext {
  userId: string;
  email?: string;
  timezone?: string;
}
```

---

# Part 2: Architecture Guide

## Core design principles

### 1. Nodes define contracts, not raw execution code

A node should describe:

* what kind of unit it is
* what input it expects
* how that input is sourced
* what output shape it guarantees
* what execution constraints apply

This makes the DAG portable across runtimes.

### 2. Edges describe graph relationships, not data paths alone

An edge tells the engine how nodes are related at the graph level.
Actual field-level value routing is handled by `input.bindings`.

### 3. Every node has explicit input and output contracts

This allows:

* runtime validation
* clear UI visualization
* safer schema evolution
* easier reuse across many flows

### 4. Definitions are stable, executions are ephemeral

`AgentDefinition` and `AgentDAG` are versioned configuration.
`JobRun`, `NodeExecution`, and `ToolInvocation` are execution records.

---

# Part 3: What each major property does

## BaseNode

### `id`

Stable DAG-local identifier used by edges and bindings.

Example:

```ts
id: "fetch_inventory"
```

### `version`

Version of the node definition itself. Important for reproducibility.

Example:

```ts
version: "2.1.0"
```

### `type`

Tells the engine which executor to use.

Examples:

* `tool`
* `llm`
* `transform`
* `evaluator`
* `condition`

### `deterministic`

Whether the same input should reliably produce the same output.
Useful for caching and replay.

Examples:

* transform node: usually `true`
* llm node: often `false`

### `input.schema`

Defines the exact input shape expected after bindings are resolved.

### `input.bindings`

Field-level map from upstream values into this node’s input contract.
This is one of the most important improvements in v2.

Example:

```ts
bindings: {
  pantryItems: { source: "job_input", path: "pantry.items" },
  storeCatalog: { source: "node_output", nodeId: "fetch_inventory", path: "data.items" },
  budget: { source: "job_input", path: "constraints.maxBudget" }
}
```

### `output.schema`

Defines what downstream consumers can rely on.

### `execution`

Operational concerns only.

Example:

```ts
execution: {
  timeoutMs: 10000,
  retryPolicy: { maxRetries: 2, strategy: "rerun", backoffMs: 500 },
  cachePolicy: { enabled: true, ttlSeconds: 300 }
}
```

---

## ToolNode

Represents external capability invocation.

Use for:

* web search
* email fetch
* calendar read
* database lookup
* pricing query

Important properties:

* `toolName`
* `toolVersion`

---

## TransformNode

Represents deterministic business logic or shape conversion.

Use for:

* normalization
* aggregation
* ranking formulas
* converting one schema version to another

Important properties:

* `transformName`
* `transformVersion`

---

## LLMNode

Represents language-model generation or reasoning under a strict output contract.

Important properties:

* `promptTemplate`
* `model`
* `temperature`
* `maxTokens`
* `outputConfig`

Example:

```ts
outputConfig: {
  schema: mealPlanSchema,
  enforcement: "strict"
}
```

---

## EvaluatorNode

Scores and critiques another node’s output and can signal retry behavior.

Important distinction:
The evaluator does not directly perform retries. It produces a signal. The engine decides what to do with it.

---

## ConditionNode

Used for branching.

Example use cases:

* if budget exceeds threshold, go to a cheaper planning branch
* if evaluator score is low, route to revision branch
* if no store results are found, route to fallback branch

---

## AgentEdge

Graph relationship between nodes.

### `type: data`

Normal data dependency.

### `type: feedback`

A review or critique path.

### `type: control`

Branching or sequencing dependency.

### `type: context`

Context propagation or memory hydration path.

---

# Part 4: Clear example flow

## Example: Grocery Planner DAG

This example uses a grocery planning workflow because it shows the value of all major concepts cleanly.

### User job input

```ts
{
  pantry: {
    items: ["eggs", "greek yogurt", "rice"]
  },
  preferences: {
    proteinGoal: 160,
    mealsPerDay: 3,
    avoid: ["shellfish"]
  },
  constraints: {
    maxBudget: 90,
    prioritizeSales: true
  },
  stores: ["Trader Joe's", "Safeway"]
}
```

---

## Node A: `fetch_inventory`

Type: `tool`

Purpose:
Retrieve current store items and prices.

```ts
{
  id: "fetch_inventory",
  version: "1.0.0",
  type: "tool",
  name: "Fetch store inventory",
  toolName: "shopping.getInventory",
  deterministic: false,
  input: {
    schema: {
      type: "object",
      properties: {
        stores: { type: "array", items: { type: "string" } }
      },
      required: ["stores"]
    },
    bindings: {
      stores: { source: "job_input", path: "stores" }
    }
  },
  output: {
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              price: { type: "number" },
              protein: { type: "number" },
              store: { type: "string" }
            },
            required: ["name", "price", "store"]
          }
        }
      },
      required: ["items"]
    },
    outputKind: "structured"
  },
  execution: {
    timeoutMs: 10000,
    retryPolicy: { maxRetries: 1, strategy: "rerun" }
  }
}
```

Why this is clean:

* input comes from job input
* output is structured and reusable by later nodes
* node remains independent from UI or runtime state

---

## Node B: `normalize_options`

Type: `transform`

Purpose:
Filter duplicate items, convert units, attach simple protein-per-dollar values.

```ts
{
  id: "normalize_options",
  version: "1.0.0",
  type: "transform",
  name: "Normalize store options",
  transformName: "inventory.normalizeForPlanning",
  deterministic: true,
  input: {
    schema: {
      type: "object",
      properties: {
        inventoryItems: { type: "array", items: { type: "object" } },
        pantryItems: { type: "array", items: { type: "string" } }
      },
      required: ["inventoryItems", "pantryItems"]
    },
    bindings: {
      inventoryItems: { source: "node_output", nodeId: "fetch_inventory", path: "data.items" },
      pantryItems: { source: "job_input", path: "pantry.items" }
    }
  },
  output: {
    schema: {
      type: "object",
      properties: {
        candidateFoods: {
          type: "array",
          items: { type: "object" }
        }
      },
      required: ["candidateFoods"]
    },
    outputKind: "structured"
  }
}
```

Why this matters:
Transforms keep deterministic data shaping out of prompts.

---

## Node C: `draft_meal_plan`

Type: `llm`

Purpose:
Create a meal plan using normalized food options and user goals.

```ts
{
  id: "draft_meal_plan",
  version: "1.0.0",
  type: "llm",
  name: "Draft meal plan",
  promptTemplate: "Create a high-protein grocery plan using the provided foods and constraints. Return valid JSON only.",
  model: "gpt-5",
  temperature: 0.2,
  maxTokens: 2000,
  deterministic: false,
  input: {
    schema: {
      type: "object",
      properties: {
        candidateFoods: { type: "array", items: { type: "object" } },
        proteinGoal: { type: "number" },
        mealsPerDay: { type: "number" },
        budget: { type: "number" },
        avoid: { type: "array", items: { type: "string" } }
      },
      required: ["candidateFoods", "proteinGoal", "mealsPerDay", "budget"]
    },
    bindings: {
      candidateFoods: { source: "node_output", nodeId: "normalize_options", path: "data.candidateFoods" },
      proteinGoal: { source: "job_input", path: "preferences.proteinGoal" },
      mealsPerDay: { source: "job_input", path: "preferences.mealsPerDay" },
      budget: { source: "job_input", path: "constraints.maxBudget" },
      avoid: { source: "job_input", path: "preferences.avoid" }
    }
  },
  output: {
    schema: {
      type: "object",
      properties: {
        meals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              mealName: { type: "string" },
              ingredients: { type: "array", items: { type: "string" } },
              estimatedProtein: { type: "number" },
              estimatedCost: { type: "number" }
            },
            required: ["mealName", "ingredients", "estimatedProtein", "estimatedCost"]
          }
        },
        shoppingList: {
          type: "array",
          items: { type: "string" }
        },
        estimatedTotalCost: { type: "number" }
      },
      required: ["meals", "shoppingList", "estimatedTotalCost"]
    },
    outputKind: "plan"
  },
  outputConfig: {
    schema: {
      type: "object"
    },
    enforcement: "strict"
  },
  execution: {
    timeoutMs: 20000,
    retryPolicy: { maxRetries: 2, strategy: "regenerate" }
  }
}
```

Why this is better than v1:

* the LLM receives resolved structured input
* downstream nodes can trust a declared output shape
* retries are execution policy, not hidden in prompt logic

---

## Node D: `evaluate_plan`

Type: `evaluator`

Purpose:
Check whether the plan meets budget and protein expectations.

```ts
{
  id: "evaluate_plan",
  version: "1.0.0",
  type: "evaluator",
  name: "Evaluate meal plan",
  promptTemplate: "Score the plan for budget fit, protein fit, and practical grocery quality. Return valid JSON only.",
  model: "gpt-5",
  temperature: 0,
  input: {
    schema: {
      type: "object",
      properties: {
        plan: { type: "object" },
        proteinGoal: { type: "number" },
        budget: { type: "number" }
      },
      required: ["plan", "proteinGoal", "budget"]
    },
    bindings: {
      plan: { source: "node_output", nodeId: "draft_meal_plan", path: "data" },
      proteinGoal: { source: "job_input", path: "preferences.proteinGoal" },
      budget: { source: "job_input", path: "constraints.maxBudget" }
    }
  },
  output: {
    schema: {
      type: "object",
      properties: {
        score: { type: "number" },
        passed: { type: "boolean" },
        issues: { type: "array", items: { type: "string" } },
        summary: { type: "string" },
        signal: {
          type: "object",
          properties: {
            retry: { type: "boolean" },
            strategy: { type: "string" },
            targetNodeId: { type: "string" }
          }
        }
      },
      required: ["score", "passed", "issues", "summary"]
    },
    outputKind: "critique"
  }
}
```

Example output:

```ts
{
  score: 0.72,
  passed: false,
  issues: [
    "Estimated total cost exceeds budget by 14 dollars",
    "Two meals rely too heavily on overlapping ingredients"
  ],
  summary: "The plan is nutritionally reasonable but misses budget efficiency.",
  signal: {
    retry: true,
    strategy: "feedback_adjust",
    targetNodeId: "draft_meal_plan"
  }
}
```

---

## Node E: `budget_gate`

Type: `condition`

Purpose:
Choose whether the flow can finish or should route into a cheaper revision branch.

```ts
{
  id: "budget_gate",
  version: "1.0.0",
  type: "condition",
  name: "Budget acceptance gate",
  conditionLanguage: "expression",
  input: {
    schema: {
      type: "object",
      properties: {
        passed: { type: "boolean" },
        score: { type: "number" }
      },
      required: ["passed", "score"]
    },
    bindings: {
      passed: { source: "node_output", nodeId: "evaluate_plan", path: "data.passed" },
      score: { source: "node_output", nodeId: "evaluate_plan", path: "data.score" }
    }
  },
  output: {
    schema: {
      type: "object",
      properties: {
        selectedBranch: { type: "string" }
      },
      required: ["selectedBranch"]
    },
    outputKind: "decision"
  },
  branches: [
    { when: "passed == true && score >= 0.8", toNodeId: "publish_plan" },
    { when: "passed == false", toNodeId: "revise_plan" }
  ],
  defaultToNodeId: "revise_plan"
}
```

---

## Node F: `publish_plan`

Type: `transform`

Purpose:
Produce final user-facing output and artifacts.

This might package:

* meal summary
* shopping list
* compact grocery card artifact

---

# Part 5: Example edges

```ts
[
  { id: "e1", from: "fetch_inventory", to: "normalize_options", type: "data" },
  { id: "e2", from: "normalize_options", to: "draft_meal_plan", type: "data" },
  { id: "e3", from: "draft_meal_plan", to: "evaluate_plan", type: "feedback" },
  { id: "e4", from: "evaluate_plan", to: "budget_gate", type: "control" },
  { id: "e5", from: "budget_gate", to: "publish_plan", type: "control" },
  { id: "e6", from: "budget_gate", to: "revise_plan", type: "control" }
]
```

Important note:
Edges show graph dependency and sequencing.
Bindings still handle exact field mapping.

---

# Part 6: How schemas scale cleanly over time

## 1. Schema versioning

Each schema can carry a version.
That allows a node to evolve without forcing every downstream consumer to change immediately.

Example:

* `mealPlanSchema@1.0.0`
* `mealPlanSchema@1.1.0` adds `estimatedCalories`

## 2. Stable output envelopes

Every execution stores output as a `NodeOutputEnvelope`.
That means even if the data changes, artifacts and metadata remain structurally consistent.

## 3. Deterministic transforms for migrations

Use transform nodes to adapt old outputs to new formats.
That keeps migration logic outside prompts.

## 4. Strict runtime validation

At execution time:

* resolve bindings
* validate against input schema
* execute node
* validate output against output schema

This prevents bad data from silently flowing through the graph.

## 5. Separate graph structure from field mapping

This is why `edges` and `bindings` are separate.
The same graph can be reused with slightly different data contracts.

---

# Part 7: Practical engine behavior

A clean execution lifecycle for each node should be:

1. wait for dependency completion
2. resolve `input.bindings`
3. validate resolved input against `input.schema`
4. execute using node executor by `type`
5. validate output against `output.schema`
6. persist `NodeExecution`
7. schedule downstream nodes based on edges and condition outcomes
8. if evaluator emits retry signal, let engine apply retry policy

---

# Part 8: Why this model is stronger than the original

## Original strengths

Your original model already had:

* clean separation of node types
* DAG-level versioning
* evaluation as a first-class concept
* job/run persistence concepts

## Main improvements in v2

### Structured bindings instead of raw strings

This is the biggest upgrade for scale and maintainability.

### Output envelopes instead of loose `Record<string, unknown>`

This supports richer UI, file artifacts, and better debugging.

### Execution policy as its own concern

This prevents business contracts from being polluted by runtime knobs.

### Node versioning

Necessary for debugging and long-lived agents.

### Condition nodes and richer edge semantics

These keep branching and control flow explicit.

### Better schema model

This makes future adapters, validation, and evolution much cleaner.

---

# Part 9: Recommended implementation order

1. Replace `inputMapping` with `DataRef` bindings
2. Add runtime validation for every node input and output
3. Move execution settings into `ExecutionPolicy`
4. Add `NodeOutputEnvelope`
5. Add `ConditionNode`
6. Add node-level versioning
7. Add schema versioning and migration transforms

---

# Part 10: Final guidance

The most important conceptual shift is this:

A DAG should not just be a graph of steps.
It should be a graph of typed contracts whose runtime execution is inspectable, versioned, and safe.

That is what will let this system scale from:

* one grocery flow
* to many reusable agents
* to a user-configurable orchestration platform

with much less hidden complexity.

```
```
