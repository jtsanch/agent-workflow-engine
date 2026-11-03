# Trustworthy, customizable execution

Status: design revised on 2026-11-03 in a reconciliation pass (see [progress.md](progress.md#reconciliation-findings-2026-11-03)). The owner agreed to this feature and asked it to deliver two things: resumable workflow execution after a worker is interrupted, and one bounded customization. This design is proposed. It has not yet passed independent review. Phases are in [plan.md](plan.md). State, decisions and findings are in [progress.md](progress.md).

## Outcome

A user configures a job from a published workflow definition, queues a run, and can see per-node progress and the result or failure. If the worker running the run dies or loses its lease, another worker continues from the last checkpointed node. It uses the same definition version, inputs and parameters the run started with. The platform states exactly what it guarantees about repeated work and external side effects.

The first customization lets a user set a validated workflow parameter that the definition declares. It was chosen because it exercises the persisted retry state that recovery must restore.

Fan-out/fan-in and the DAG editor remain follow-on features (see the roadmap; `docs/features/roadmap.md` is not yet on `develop`). This design reserves the identities those features need without implementing them: node-instance keys, pinned definition references and a parameter contract.

## Baseline: verified current behavior

Evidence base: `origin/develop` at `1f14d162`, re-verified on 2026-11-03. The first baseline (2026-11-02) used local `899fdf97`. Its runtime code is identical to `develop`: `develop` contains both of those commits through squash-merge #24 (`4a7317a3`), and the only later commit (#26) adds `portable-engineering-skills/` alone.

Labels:

- **[code]**: read in source on `develop`.
- **[test]**: an existing suite was run.
- **[probe]**: a 2026-11-02 throwaway script ran against disposable Postgres 16 with V1–V17, using the real `PostgresWorkerPersistenceRepository` and `processNextQueuedRun`. It was not re-run on 2026-11-03 because there was no Docker daemon. The code under test is unchanged.

### Workflow and execution

- One seeded definition exists: `grocery-planner` / `dag_grocery_planner` v2.0.0. It has eight sequential nodes: `generateMeals` and `estimateNutrition` (`llm`); `normalizeMeals`, `aggregateIngredients`, `convertToPurchasableUnits` and `calculateCosts` (`transform`); `validatePlan` (`evaluator`); and `finalizePlan` (`transform`). It has **no tool nodes**, so it makes no external mutations; its only external calls are LLM requests. [code: `packages/agent-sdk/src/definitions.ts`]
- No node declares `execution.retryPolicy`, so node-level failure retries (`maxRetries` defaults to 0) and evaluator-driven retries (`shouldRetry` requires a retry policy) are **unreachable**. [code: `dag-engine.ts:201`, `retry-manager.ts:38`]
- **Retry accounting is shared and target-scoped.** A node's `retryCount` is advanced by its own failure retries (`recordFailure`) and by evaluator loops that target it (`markForRetry`). The evaluator gate compares the *target's* `retryCount` with the *evaluator's* `maxRetries`. `clearSubgraph` resets downstream nodes to `pending` but keeps their `retryCount`. Downstream nodes therefore re-execute with the same `retryCount`, and the evaluator itself is re-run with an unchanged count. [code: `execution-state.ts:100–162`, `retry-manager.ts:66–96`]
- **The evaluator LLM chooses the retry target.** `retryTargetNodeId` from the LLM output is accepted if it names any node in the DAG. If it is missing, the target defaults to the evaluator itself, which re-evaluates the same input. The prompt names three intended targets, but nothing enforces them. [code: `retry-manager.ts:46–64`; prompt in `definitions.ts`]
- Without `OPENAI_API_KEY`, LLM nodes return schema-derived mock output, and the mock evaluator always sets `shouldRetry: false`. `notifications.send` returns a mock delivery when `NOTIFICATIONS_WEBHOOK_URL` is unset. [code: `node-runner.ts`, `notifications-send-tool.ts`]
- **HTTP retries inside tools.** `BaseTool.request` retries up to 3 times on a network error, a timeout (no status), 408, 429 or 5xx. `notifications.send` uses this for its webhook `POST` (`maxAttempts: 3`, 5 s timeout), so a single node attempt can deliver up to three times today. [code: `base-tool.ts:29–63`, `notifications-send-tool.ts:28–42`]
- The real worker path with mock LLM succeeds: 8 nodes are `succeeded` and the run finalizes `succeeded`. [probe S1]
- `TransformNode` carries an in-process `run` function, so a definition is code plus data and cannot be fully persisted as JSON. [code: `shared/src/domain/types.ts:169`]
- Nodes in a run execute sequentially, and a worker processes one run at a time. `ExecutionState` lives in memory only. [code]
- `executeDAG` always returns `memoryWrites: []`, so the `job_memories` upsert path is currently dead code. [code: `dag-engine.ts:385`]
- `runJob` passes `` `run_${job.id}` `` into the engine as the run id, not the claimed run id. Any id derived inside the engine is job-scoped. [code: `job-runner.ts:27`]
- Node execution ids and tool invocation ids are random 8-character strings. [code: `node-runner.ts:41`, `dag-engine.ts:115,318`]

### Claiming, leases, replay and shutdown

- The claim selects the oldest `queued` run by `queued_at`, or a `running` run whose `lease_expires_at` has passed, using `FOR UPDATE SKIP LOCKED`. It then sets `running`, `claimed_by_worker_id` and a lease. A `running` row with a null lease is never reclaimed. Across 50 trials with 8 concurrent claimers, each run had exactly one claimer. [code: `worker-persistence-repository.ts:48–134`; probe race]
- The worker clock sets both the expiry comparison (claimer) and the lease expiry (owner). [code: lines 51–52, 137–138]
- **Node outputs are not checkpointed.** Node executions, feedback, tool invocations and usage are written as a batch only after `runJob` returns. [code: `queue-worker.ts:62–78`, `116–125`]
- Reclaiming an expired run **deletes** that run's `node_executions`, `node_feedback` and `tool_invocations`, then replays the DAG from the first node. [code: `clearRunReplayArtifacts`; probe S2]
- Fencing uses `claimed_by_worker_id`. After a takeover, the stale owner's renew, insert and finalize are rejected with `RunOwnershipLostError`, and its usage is not committed. [probe S2]
- There is no claim epoch, attempt counter or reclaim limit. The same worker id can reclaim its own expired run, and a run that kills its worker is reclaimed forever. [probe S3]
- Ownership is checked only before and after `runJob`. A worker that has lost its lease keeps executing every remaining node. [code; queue-worker unit test "skips finalization after lease ownership is lost during execution"]
- A heartbeat error that is not about ownership stops renewals permanently. `stop()` rethrows it from `finally`, `processNextQueuedRun` rejects, and the worker loop in `start.ts` exits. The run stays `running` until its lease expires. [code: `queue-worker.ts:204–243`, `start.ts:86–92`; not executed]
- **Shutdown does not release leases.** On SIGTERM the worker waits `workerShutdownGraceMs` for the active run. If the run has not finished by then, the worker calls `process.exit(1)` without releasing the lease, so every deploy during a long run looks the same as a crash. [code: `start.ts:36–70`, `shutdown.ts`]
- **Quota is checked at every claim**, reclaims included. The usage-counter reset is an unfenced absolute write (`updateUsageState`) that can race with `finalizeRun`'s increment. [code: `queue-worker.ts:54–60`, `worker-persistence-repository.ts:213–226`]
- Usage from work lost to a takeover is never recorded. [code; probe S2]
- The `job_runs.status` CHECK rejects `cancelled`, and `node_executions` accepts duplicate rows. [probe S4, S5]
- The worker suite passes (13 files, 97 tests) with a fake repository and a mocked `runJob`. **No test exercises the real claim, reclaim, deletion or fencing SQL.** [test 2026-11-03]

### Definition identity and pinning

- Jobs store only `dag_id` and `agent_definition_key`; runs store no definition version. At claim time the worker resolves `seedAgentDefinitions.find(dag.id === job.dagId || key === job.agentDefinitionKey)`. [code: `queue-worker.ts:33`, `job-runner.ts:9`]
- The API resolves definitions from its own build of `seedAgentDefinitions` (`agent-catalog.ts`). The API and the worker deploy separately (Vercel and Railway), so their catalogs can differ during a deploy. [code; `docs/architecture/infra.md`]
- The worker reads `jobs.inputs` at claim time. There is no job-edit API. [code]
- The compiled-DAG cache is keyed by `agentDefinition.id` for the life of the process. [code: `compile-dag.ts:22`]
- `agent_dags`, `agent_nodes` and `job_dag_versions` are unused. [code: grep]
- The web runs page maps a run to the *current* catalog definition. [code: `RunsPage.tsx`]

### Job-creation experience

- `days` and `servings` have no UI fields. Empty number fields are sent as `0`. The job name, schedule fallback, timezone and alert destination are hardcoded, and creation failures are not shown. [code: `CreateJobPage.tsx:76–99`]
- The API **does not validate `inputs` against `inputSchema`**. `enqueueRun` checks ownership and `job.status === 'active'`, but it neither limits concurrent runs per job nor looks at definitions. [code: `jobs-service.ts`, `runs-service.ts:83–105`]
- There is no scheduler. [code]

### Concurrent work

- PR #25 ("neon savings cost", pg-boss delivery) was **closed unmerged** on 2026-11-03. The branch `bugfix/lower-db-cost` still exists. Its design conflicts with §1, because redelivery took `running` runs without a lease check. If pg-boss is reintroduced, it may be used only as a wake-up signal (see the constraints in plan.md).

## Proposed design

### 1. Run ownership: claim epochs and fencing (worker)

- Add `job_runs.claim_epoch bigint not null default 0`, incremented on every claim, and `recovery_count int not null default 0`, incremented only when an **expired lease** is reclaimed.
- **The fence uses both columns:** `id = $run and status = 'running' and claimed_by_worker_id = $worker and claim_epoch = $epoch`. Keeping the worker-id predicate makes the fence safe during the rolling deploy that introduces epochs. A pre-epoch worker that reclaims a run overwrites `claimed_by_worker_id`, which fences the new worker. Pre-epoch workers do not check epochs, but the new claim changes the worker id they fence on. Worker ids are unique per process (`start.ts`).
- Leases use the database clock. The claim compares with `now()`, and claim and renew set `lease_expires_at = now() + $leaseMs` and return `lease_expires_at - now()`. The worker sets its local deadline from a monotonic clock as `request start + returned remaining - safety margin` (proposed: one heartbeat interval).
- **Recovery cap (D8):** when an expired-lease reclaim would make `recovery_count` exceed the cap, the claim transaction marks the run `failed` with error code `recovery_limit_exceeded` and does not execute it.
- **Graceful release:** on SIGTERM the worker stops at the next node boundary, after that node's checkpoint commits. It then releases the run in one fenced statement: status back to `queued`, `lease_expires_at = null`, epoch unchanged, `recovery_count` unchanged. A deploy therefore never counts against the cap. If the grace period expires mid-node, the worker exits and that becomes a normal expired-lease recovery. Before Phase 5 (no checkpoints), release means replay from the start, as it does today.
- **Heartbeat:** retry transient renewal errors until the local deadline. Only `RunOwnershipLost` or reaching the deadline ends ownership, and neither crashes the process.
- **Abort:** on ownership loss or deadline, the worker fires an `AbortSignal` in `RunContext`. The engine checks it before every intent write and every node invocation, and tools pass it to HTTP calls. A stale owner can still finish the call it is in, but it cannot commit.
- `runJob` receives the claimed run id and epoch.

### 2. Definition, input and parameter pinning (shared, API, worker)

- **Definition reference.** `DefinitionRef = { key, version, contentHash }`. `contentHash` is a SHA-256 over a canonical JSON serialization (sorted keys, no `undefined`) of the definition. Each transform's `run` is replaced by its `transformRef` name and each transform's `transformVersion`. Changing transform code without bumping `transformVersion` cannot be detected by the hash. Two guards cover this: the transform registry exposes `(transformRef, transformVersion)` pairs, and a unit test pins the current grocery hash, so any edit to the definition file forces a deliberate hash update in review.
- **Versioned catalog.** `getDefinition(key, version)` serves every version listed in code. A worker advertises the `(key, version, hash)` triples it serves.
- **The job pins at creation; the run snapshots at enqueue.** `POST /jobs` resolves the current published version and stores `definition_key` and `definition_version` on the job. It validates `inputs` and `parameters` against **that** version. `POST /runs` reads the job's pinned version, re-validates inputs and parameters against it as a defence, and writes `definition_key`, `definition_version`, `definition_hash`, `input_snapshot` and `parameters_snapshot` (defaults applied) onto the run. Validation and execution therefore always use the same version. The worker executes only from the run's snapshot. Moving a job to a newer version is an explicit action and is out of scope (D5).
- **Mixed versions across API and workers.** The claim query filters to the `(definition_key, definition_version)` pairs the worker serves. A served version whose hash differs from the run's hash is a deployment defect, and the run fails with `definition_hash_mismatch`. Runs pinned to a version no live worker serves stay `queued` (D5).
- **Legacy rows.** Jobs created before the migration are backfilled with the version that is current when the migration runs. Runs queued before it are pinned in the fenced claim transaction, and `definition_pinned_at_claim = true` is recorded.

### 3. Node checkpoints (worker; schema owned by API migrations)

New table `run_node_states`, one row per `(run_id, node_instance_key)`:

| column | purpose |
| --- | --- |
| `node_instance_key` | `nodeId` today; `nodeId#<itemKey>` is reserved for fan-out |
| `node_id`, `status` | `pending`, `running`, `completed` or `failed`; `waiting` is reserved and rejected by a CHECK in this feature |
| `retry_count` | budget counter with the engine's current semantics (failure retries and evaluator loops targeting this node); recovery never advances it |
| `invocation` | monotonic per-row counter, advanced every time workflow semantics schedule the node again: a failure retry, or a reset by an evaluator loop (including downstream nodes and the evaluator itself). Recovery does not advance it. |
| `input_hash` | hash of the resolved input of the current invocation; the full input lives in the history row |
| `output`, `error_code`, `error_message` | committed result of the current invocation |
| `idempotency_key` | `sha256(run_id : node_instance_key : invocation)`; stable across epochs and unique across workflow re-executions |
| `current_execution_id` | the `node_executions` row of the current invocation |
| `epoch` | the claim epoch that last wrote the row |
| `started_at`, `completed_at`, `updated_at` | timing |

The evaluator loop count is held on the evaluator's own row as `loop_count`; see §6.

`node_executions` remains the append-only history. It gets one row per invocation per epoch, with a deterministic id `sha256(run_id:node_instance_key:invocation:epoch)` and new columns `invocation` and `claim_epoch`. It is unique on `(job_run_id, node_id, invocation, claim_epoch)`. Keying on `retry_count` would reject the second evaluator loop, because downstream nodes keep their `retry_count`. Reclaim stops deleting history, and superseded epochs are marked by their `claim_epoch`.

**Write protocol, per node, fenced by §1:**

1. **Intent:** upsert the node's state to `running` with `invocation`, `input_hash`, `idempotency_key` and `epoch`, and insert the history row as `running` with its resolved input. **The worker invokes the node only after the intent commit succeeds.** A rejected intent aborts the run context.
2. **Checkpoint:** after the node returns, a single transaction does all of the following:
   - locks the run row and renews the lease;
   - sets the node `completed` with its output;
   - completes the history row;
   - inserts feedback and tool invocations.

   When an evaluator requests an accepted retry, the same transaction also:
   - sets the target and every downstream node (the evaluator included) back to `pending`;
   - advances their `invocation`;
   - advances the target's `retry_count`;
   - advances the evaluator's `loop_count`.

   A failed node with retries left is set to `pending`, and its `invocation` and `retry_count` advance.
3. A node counts as checkpointed only after step 2 commits.
4. **Terminal:** finalization (fenced) writes the run status and output, then deletes the run's `run_node_states` rows in the same transaction. After that, history is the record (D6).

**Usage accounting is not fenced on the current epoch.** Each LLM call appends a usage event with deterministic id `sha256(run_id:node_instance_key:invocation:epoch:call_seq)` (`on conflict do nothing`) and increments the user counters in the same statement batch. It is fenced only on the run existing. Tokens were really spent, so a stale owner's spend is still recorded. This replaces batch usage at finalize and closes most of the lost-accounting gap.

The engine stays persistence-agnostic. `executeDAG` accepts restored state plus `onNodeStarting` and `onNodeSettled` hooks, and the queue layer implements them through the repository.

**Resume on claim:**

- Load `run_node_states` and rebuild `ExecutionState`: completed outputs, `retry_count`, `invocation` and the loop count.
- Seed the per-run LLM budget from **all** usage recorded for the run, across epochs.
- Re-check quota. If it is exceeded, fail with `quota_exceeded` and keep the history.
- Nodes still `completed` are never invoked again by recovery.
- A node left `running` by an earlier epoch was interrupted, and §4 decides what happens to it.

**Execution-protocol gate.** `job_runs.execution_protocol smallint` records the protocol of the worker that first executes the run: 1 = replay (Phase 5), 2 = resume (Phase 6b). The claim query only takes runs with `execution_protocol <= $workerProtocol`, or a null protocol. A replay-only worker therefore never reclaims a run that a resume worker started, and it can't re-invoke that run's interrupted `unsafe` nodes during a rolling deploy. A protocol-2 worker may take over a protocol-1 run. That run has no reliable intents, so it is replayed under protocol-1 rules.

### 4. Side effects and interrupted nodes

Each node gets a side-effect class. Tool nodes derive it from the new field `ToolDefinition.sideEffects`. A node may make its class stricter, never weaker.

| class | examples | interrupted-node policy on resume |
| --- | --- | --- |
| `none` (no external mutation) | transform, condition, LLM, `web_search.search` | re-run the same invocation; an LLM re-run costs tokens |
| `idempotent` (the provider deduplicates by key) | a tool whose provider honours `Idempotency-Key` | re-run the same invocation with the same `idempotency_key` |
| `unsafe` (mutation without deduplication) | `notifications.send` by default | do **not** invoke again; mark the node `failed` with `outcome_unknown` and fail the run with that reason |

**Enforcement rules (Phase 6a), so that the guarantees below hold:**

- `unsafe` tools make one HTTP attempt (`maxAttempts: 1`), except that they retry errors raised before any request bytes were sent (DNS failure, connection refused). `notifications.send` changes accordingly. `idempotent` tools may keep in-call retries, and they must send `idempotency_key`.
- Definition validation (shared) rejects an `unsafe` node that has `retryPolicy.maxRetries > 0` or that sits in the subgraph an evaluator can reset. Workflow semantics therefore never re-run an `unsafe` node either. This rule doesn't constrain anything today, because no seeded node is `unsafe`.
- Before invoking an `unsafe` node, the worker checks the abort signal and requires that the remaining lease exceeds the tool timeout plus the safety margin. Otherwise it releases the run (§1) and does not invoke.
- `notifications.send` also sends `Idempotency-Key`. It stays `unsafe` unless a deployment declares the webhook deduplicating.

**What is guaranteed** once Phases 2–6 are deployed, and for runs whose `execution_protocol = 2`:

- Only the current claim epoch can commit run state or node state. A stale owner's state commits are rejected. Usage events are the exception: they are accounting facts and are recorded from any epoch.
- Recovery never invokes a checkpointed node again. An evaluator loop re-executes nodes as workflow semantics, and each re-execution is recorded as a new `invocation`.
- A resumed run uses its pinned definition version, input snapshot and parameter snapshot.
- Recovery neither resets nor consumes a node's `retry_count`, `invocation` or the evaluator loop count, and total expired-lease recoveries per run are capped.
- An `unsafe` node is invoked at most once per run, and each invocation makes at most one HTTP attempt that could have reached the provider.

**What is not guaranteed:**

- **Exactly-once execution.** Work after the last checkpoint runs again: at-least-once for `none` and `idempotent` nodes. A stale owner may still be inside a call after it loses its lease.
- **Exactly-once external effects.** `idempotent` nodes are effectively-once only if the provider honours the key. For `unsafe` nodes the effect happened zero or one times, possibly concurrently with a takeover. The platform reports `outcome_unknown` rather than guessing.
- **Complete accounting.** Tokens from an LLM call that was in flight when its worker died are lost.
- **Sub-node retries.** The 3 structured-output parse attempts inside an LLM node, and in-call retries of `none` or `idempotent` tools, restart from zero when a node is re-run.
- **Deterministic replay.** A re-run LLM node produces different output. An `input_hash` mismatch on resume is logged (hash only, never the payload) and is not rejected.
- **Guarantees for runs on protocol 1 or no protocol** (before Phase 6b): those runs keep today's replay semantics.

### 5. Long-running asynchronous operations: first-slice limitation

No existing tool starts a remote operation that outlives a call, so this feature does **not** support them. A node must complete within one worker invocation, protected by the lease heartbeat. The contract reserved for the durable-pickup feature:

- Node status `waiting`, with `operation = { provider, operationId, submittedAt, pollAfter, deadline }`.
- Submission uses the node's `idempotency_key` as the provider request id. Providers without that capability count as `unsafe` for submission.
- Run status `waiting` with a `wake_at` time. The lease is released while the run waits, and the claim query includes `waiting` runs whose `wake_at` has passed.

### 6. First customization: definition-declared job parameters (D4)

**Contract.** `AgentDefinition.parameters` is a list of parameters. Each has:

- a `key` and a `label`;
- a bounded JSON schema, limited to integer, number, boolean or string enum with explicit bounds;
- a `default`;
- a `target = { nodeId, field }`. `field` comes from a closed enum in `packages/shared`. Initially that enum has one member, `evaluator.maxLoops`, valid only when `nodeId` is an evaluator.

The API rejects definitions or jobs that break these rules. Parameters are set at job creation and pinned per run (§2). The worker applies them to its copy of the pinned definition before compiling, and records the effective hash: base hash plus canonical parameters.

**First parameter: `qualityGateRetries`** (integer 0–2, default 1). It targets `validatePlan` and **sets `evaluator.maxLoops`**. Today's engine has three problems that would make "retries" ambiguous and its cost unbounded:

1. **Loop limit.** Phase 4 adds an evaluator-scoped `loop_count`. A loop is accepted only while `loop_count < maxLoops`, regardless of target. The total number of re-executions is then bounded by `maxLoops`, not by `maxLoops` times the number of targets.
2. **Allowed targets.** The definition declares `retryTargets` on the evaluator node (`["generateMeals", "estimateNutrition", "calculateCosts"]` for `validatePlan`, matching its prompt). A `retryTargetNodeId` outside that list, or a missing one, is not retried. It is recorded as feedback with `retry_rejected: invalid_target`. Self-targeting is impossible unless declared.
3. **Separate loops from failure retries.** `evaluator.maxLoops` is a new field. It doesn't reuse `execution.retryPolicy.maxRetries`, which also drives node failure retries (`dag-engine.ts:201`). The parameter therefore cannot turn on failure retries of the evaluator by accident. The existing `retryPolicy` gate in `shouldRetry` is replaced by `maxLoops > 0` for evaluators. No seeded node uses `retryPolicy`, so nothing else changes.

Worst-case cost with `qualityGateRetries = 2`: two extra passes. Targeting `generateMeals` re-executes all 8 nodes, and 3 of them call an LLM (`generateMeals`, `estimateNutrition`, `validatePlan`). The per-run LLM budget still applies.

**Delivered with the input fixes on the same path:**

- The API validates `inputs` against the pinned `inputSchema` and `parameters` against their schemas. It uses a validator moved to `packages/shared`, so the worker and API share one implementation. Errors are `422 invalid_job_inputs` and `invalid_job_parameters`.
- The UI renders a parameters section from the definition, omits blank number fields, lets the user name the job and shows API errors.

**Why this first:**

1. It is bounded: one shared contract, one parameter, one allowlisted field, API-validated and worker-applied. The UI only renders it.
2. It makes a dormant capability usable, and the input fixes stop invalid plans from being queued.
3. Evaluator loops reset nodes downstream and advance invocations and counters. They are the most complex state that resume must restore.
4. The parameter contract is a constrained subset of DAG authoring, with the same API-owned validation and pin model.

**Observability without live OpenAI (D4):** the mock evaluator never requests a retry. A worker-only setting, `MOCK_EVALUATOR_RETRY_TARGET` (only honoured when no `OPENAI_API_KEY` is set, and refused at startup when `NODE_ENV=production`), makes the mock evaluator request one retry of the named target on its first evaluation. This lets the drill and manual checks show loops and resume mid-loop. Unit tests use a stub registry instead.

**Versions:** the loop contract ships as grocery v2.1.0 with `maxLoops: 0` (no behavior change). The parameter ships as v2.2.0. Jobs created earlier stay pinned to their version and keep today's behavior. Older versions stay served (D5).

**Limitations:** there is no job editing and no version upgrade. Model selection is the candidate second parameter; it needs a model allowlist and a cost policy.

### 7. How this supports fan-out and DAG authoring

- **Fan-out:** `node_instance_key` gives each item its own state row, `invocation`, idempotency key and checkpoint. Fan-in becomes "all instance rows of node X are completed". Bounds, item identity (a stable `itemKey`) and partial-failure policy belong to that feature.
- **DAG authoring:** runs reference `DefinitionRef`, not code. Persisted, immutable, published versions can use the same pin, hash and served-version claim filter. Transforms must be referenced through the `transformRef` registry. The API remains the validator, and the editor is a client. The parameter target enum and the `unsafe` placement rule are validation rules the editor inherits.

### 8. Visibility, payloads and security (D6)

- Run and node state are read through the existing ownership-checked run APIs. The only new write surfaces are the job-creation fields.
- **Payload caps (D6):** the worker enforces caps at checkpoint and measures them as UTF-8 bytes of the serialized JSON. A node's output may be at most 256 KiB, and the outputs of all committed nodes in a run at most 2 MiB. Breaching either fails the node with the non-retryable `payload_too_large`, and only sizes are logged. Current grocery outputs are a few KiB. Resolved inputs are derived from earlier outputs and job inputs. They are stored once, in history, so they are bounded by those caps plus the job-input cap: the API rejects `inputs` over 64 KiB.
- **Retention (D6):** `run_node_states` is operational and is deleted at terminal finalize (§3 step 4), so checkpoints add no long-lived copy. `node_executions` keeps today's retention: kept with the run, removed by cascade only when the run is deleted. There is no user-facing job, run or account deletion path today. That gap predates this feature and is recorded as a follow-up, not solved here. Dietary and allergy data in node payloads are never written to logs.
- The run detail shows the pinned version, epoch, recovery count, recovered and re-run nodes, rejected retry targets and `outcome_unknown` failures.

## Out of scope for this feature

Fan-out/fan-in; the DAG editor and persisted user-authored definitions; asynchronous waiting operations; parallel nodes; multiple concurrent runs per worker process; limiting concurrent runs per job; run cancellation; a scheduler; job editing and version upgrade; manual resolution of `outcome_unknown`; data deletion and retention jobs.

## Open owner decisions

These are tracked with recommendations in [progress.md](progress.md#open-decisions).
