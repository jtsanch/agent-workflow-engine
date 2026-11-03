# Trustworthy, customizable execution: proposed plan

Feature: [feature.md](feature.md). Checkpoint: [progress.md](progress.md). Revised on 2026-11-03 in a reconciliation pass. The phases are proposed and have not passed independent review. **Do not start Phase 1 until the owner accepts this revised design and plan after re-review.**

## Phase renumbering (2026-11-02 → 2026-11-03)

The evaluator-loop semantics (the old P6b) must exist before checkpoints can persist them. They become a small, standalone phase ahead of checkpoints:

| 2026-11-02 | 2026-11-03 | change |
| --- | --- | --- |
| P0 | P0 | unchanged |
| P1 | P1 | now also corrects stale domain-doc statements |
| P2 | P2 | dual fence, graceful release, DB-clock deadline |
| P3 | P3 (3a, 3b) | the job pins its version at creation |
| P6b (part) | **P4** | evaluator `maxLoops`, `retryTargets`, `invocation` counter (in memory) |
| P4 | P5 | invocation-keyed history, per-call usage, `execution_protocol = 1`, payload caps |
| P5 | P6 (6a, 6b) | 6a enforces `unsafe` rules; 6b resumes with a protocol gate |
| P6 | P7 (7a, 7b, 7c) | parameters target `evaluator.maxLoops` |
| P7 | P8 | drill uses `MOCK_EVALUATOR_RETRY_TARGET` |

## Rules for every phase

- Branch from current `origin/develop`. Verify the base SHA in the PR description.
- One PR per phase, or per sub-phase where one is noted.
- Each PR updates its affected domain docs in the same change, and ships each migration together with its Drizzle schema change.
- Each PR passes `pnpm build`, `pnpm typecheck`, `pnpm lint` and the affected package tests.
- Schema PRs also pass `pnpm db:validate` against a disposable, migrated Postgres. It requires `DATABASE_URL`, and the API integration suites need a Docker daemon.
- Migrations are additive and backward compatible with the previous worker release. Each PR states its rollback: redeploying the previous worker must be safe with the new schema.
- **Definition version rule (from P3b on):** any change to the hashed content of a served definition ships as a new version. The previous version stays served (D5). Changing content under an existing version makes runs already queued on that version fail with `definition_hash_mismatch`.
- Migration numbers assume nothing else lands first; renumber if needed. If anything reintroduces pg-boss or a similar delivery mechanism, it may only wake workers. `job_runs` claim and fence stay the source of truth.

## Dependency order

```
P0 docs ─► P1 harness ─► P2 ownership ─► P3 pinning (3a ─► 3b) ─► P4 loop semantics ─┬─► P5 checkpoints ─► P6 resume (6a ─► 6b) ─► P8 visibility + drill
                                                                                       └─► P7 parameters (7a ─► 7b ─► 7c) ────────────────────────┘
```

P7 is independent of P5 and P6. The only shared file is `job-runner.ts` (7b vs 6b), so whichever lands second rebases.

## Phase 0: baseline and design (this record)

- **Owner:** docs. **Status:** revised 2026-11-03 and awaiting re-review.
- **PR boundary:** `docs/features/**` only. That covers these three records plus `docs/features/README.md` and `docs/features/roadmap.md`, which today exist only as untracked files on the owner's machine. Domain docs are not changed here.

## Phase 1: real-Postgres harness for worker persistence (characterization)

- **Depends on:** P0 accepted.
- **Runtime owner:** worker (tests only).
- **Likely files:**
  - `apps/worker/tests/integration/repositories/` (new);
  - a shared or copied testcontainer helper (from `apps/api/tests/integration/repositories/postgres-testcontainer.ts`);
  - `apps/worker/package.json` (testcontainers dev dependency) and `vitest.config.ts`.
- **Acceptance:** the tests run the real `PostgresWorkerPersistenceRepository` against migrated Postgres and pin current behavior:
  - single claimer under concurrent claims;
  - expired-lease reclaim;
  - reclaim deletes run telemetry;
  - a stale owner's renew, persist and finalize are rejected with no usage written;
  - the same worker id can reclaim its own expired run;
  - a `running` run with a null lease is never reclaimed;
  - `cancelled` is rejected.

  Each assertion that a later phase changes is labelled with that phase.
- **Tests:** the above, plus `processNextQueuedRun` + `runJob` end to end with mock LLM (8 node executions, `succeeded`).
- **Domain docs:** correct statements that are already false today. These are corrections to current behavior, not new behavior:
  - runs.md says "a queued run is the only kind of run the worker claims" (line 206) and that claims are ordered by `started_at` (line 235; it is `queued_at`);
  - workers.md's "operates on persisted run records whose status is `queued`".
- **PR boundary:** tests, test tooling and those doc corrections.

## Phase 2: claim epochs, DB-clock leases, recovery cap, graceful release, heartbeat

- **Depends on:** P1.
- **Runtime owner:** worker; migration in `apps/api/src/db`.
- **Likely files:**
  - `V18__job_run_claim_epoch.sql` (`claim_epoch bigint not null default 0`, `recovery_count int not null default 0`) and `schema/runs.ts`;
  - the worker repository interface and Postgres implementation;
  - `runtime/{queue-worker.ts,job-runner.ts}`, `start.ts` (graceful release) and `config.ts` (`WORKER_MAX_RECOVERIES`);
  - `packages/agent-sdk/src/types.ts` (`RunContext.signal`, `runId`, `epoch`).
- **Acceptance:**
  - A claim increments `claim_epoch`. Only an expired-lease reclaim increments `recovery_count`.
  - Every write is fenced on worker id **and** epoch.
  - Lease comparison and expiry use `now()`. Renew returns the remaining lease, and the worker derives its deadline from a monotonic clock.
  - A reclaim beyond the cap fails the run with `recovery_limit_exceeded` without executing it.
  - SIGTERM: the worker finishes or abandons the current run. A run that has not finished is released to `queued` in one fenced statement, without incrementing `recovery_count`. A forced exit after the grace period leads to a normal expired-lease reclaim.
  - A transient heartbeat error is retried until the deadline, and the process does not exit. Ownership loss or the deadline fires the abort signal, and the engine checks it before each node.
  - The engine receives the real run id. Replay semantics (delete and replay from the start) are otherwise unchanged.
- **Tests:**
  - **Real Postgres:**
    - ABA: worker W claims (epoch 1); the lease expires; W reclaims (epoch 2); the epoch-1 write is rejected.
    - Rolling-deploy fence: a pre-P2 claim, simulated by overwriting `claimed_by_worker_id` without bumping the epoch, rejects the P2 owner's writes.
    - Recovery cap.
    - Graceful release does not count towards the cap.
    - A skewed worker clock (fake `Date.now()` ±10 min) does not change takeover time.
  - **Unit:**
    - A transient heartbeat failure followed by success keeps ownership.
    - In a 3-node DAG where node 2's callback revokes ownership, node 3 is not invoked.
- **Failure scenarios:** worker death mid-run; a GC pause past the lease; a DB blip during heartbeat; a poison run; clock skew; same-process reclaim; a deploy during a long run; old and new workers mixed.
- **Rollback:** previous workers ignore the new columns and still fence on worker id.
- **Domain docs:** workers.md (claiming, fencing, heartbeat, shutdown and release) and runs.md (cap, `recovery_limit_exceeded`).
- **PR boundary:** worker plus migration. No node state and no definition changes.

## Phase 3: pin definition, inputs and parameters

### 3a. Shared hash and versioned catalog (no runtime behavior change)

- **Files:**
  - `packages/shared/src/domain/types.ts` (`DefinitionRef`; `transformRef` and `transformVersion` on transform nodes; `parameters` declared but empty);
  - `packages/agent-sdk/src/{definitions.ts,catalog.ts}` (`getDefinition(key, version)`, `computeDefinitionHash`, transform registry).
- **Acceptance:** the hash is stable across processes and orderings. It changes when any node field, prompt, schema, `transformRef` or `transformVersion` changes. A unit test pins the current grocery hash.

### 3b. Migration, API and worker

- **Files:**
  - `V19__definition_pins.sql`: `jobs.definition_key` and `definition_version`, backfilled with the current version; `job_runs.definition_key`, `definition_version`, `definition_hash`, `input_snapshot jsonb`, `parameters_snapshot jsonb` and `definition_pinned_at_claim bool`.
  - `apps/api/src/services/{jobs-service.ts,runs-service.ts,agent-catalog.ts}` and their repositories.
  - In the worker: the claim query (served-version filter), `job-runner.ts` (executes from the snapshot) and `compile-dag.ts` (cache key `key@version#hash`).
- **Acceptance:**
  - `POST /jobs` pins the current version.
  - `POST /runs` snapshots the job's pinned version, its inputs and its parameters (`{}` until P7).
  - The worker never reads `jobs.inputs` for pinned runs.
  - The worker skips unserved versions, and a hash mismatch fails the run with `definition_hash_mismatch`.
  - Legacy queued runs are pinned at claim.
- **Tests:**
  - API service test for the job pin and the run snapshots.
  - **Real Postgres:**
    - a v2 run stays `queued` for a worker serving only v3;
    - editing `jobs.inputs` after enqueue does not change execution;
    - a legacy run is pinned at claim;
    - a hash mismatch fails the run.
- **Failure scenarios:** a deploy changes the definition mid-run; the API is ahead of the workers (a new version that no worker serves yet stays queued); the job changes after enqueue.
- **Domain docs:** agents.md (versioned catalog, hash, `transformVersion` rule, retention), jobs.md (version pin), runs.md (snapshots) and architecture.md (definition identity).

## Phase 4: evaluator loop semantics (worker and shared; in memory, no persistence)

- **Depends on:** P3a.
- **Files:**
  - `packages/shared/src/domain/types.ts`: `EvaluatorNode.evaluator = { maxLoops, retryTargets }`. Definition validation rejects an empty `retryTargets` when `maxLoops > 0`, and targets that are not ancestors of the evaluator.
  - `apps/worker/src/runtime/{retry-manager.ts,execution-state.ts,dag-engine.ts}`.
  - `definitions.ts`: adds grocery **v2.1.0**, where `validatePlan` declares its three `retryTargets` with `maxLoops: 0`, which keeps current behavior. v2.0.0 stays served.
- **Acceptance:**
  - A loop is accepted only while the evaluator's `loop_count < maxLoops` and the target is in `retryTargets`. A rejected target is recorded in feedback as `retry_rejected: invalid_target`.
  - `invocation` advances for every node that is reset or failure-retried. `retry_count` keeps its current semantics.
  - The evaluator `retryPolicy` gate is replaced, and node failure retries are unchanged.
  - v2.1.0 gets its own pinned hash test. v2.0.0 has no `evaluator` block, so the new gate treats it as `maxLoops: 0`. That is equivalent to today, because v2.0.0 has no `retryPolicy` either.
- **Tests (unit, stub registry):**
  - With `maxLoops = 2`, targets alternate between `generateMeals` and `calculateCosts` on every evaluation. The run makes exactly 2 loops and then finalizes.
  - An LLM-returned target `finalizePlan` or a missing target is rejected.
  - Downstream nodes get distinct `invocation` values per loop.
- **Domain docs:** agents.md (evaluator loop contract).
- **PR boundary:** shared and worker engine only.

## Phase 5: per-node checkpoints, still replaying on reclaim (`execution_protocol = 1`)

- **Depends on:** P2, P3b, P4.
- **Files:**
  - `V20__run_node_states.sql`:
    - the `run_node_states` table, unique on `(run_id, node_instance_key)`, with a CHECK that excludes `waiting`;
    - `node_executions.invocation` and `claim_epoch`;
    - a unique index on `(job_run_id, node_id, invocation, claim_epoch)`, preceded by a duplicate pre-check that aborts the migration with a clear message;
    - `job_runs.execution_protocol smallint`.
  - Drizzle schema.
  - `runtime/{dag-engine.ts,execution-state.ts,queue-worker.ts}` (hooks) and a new `runtime/run-checkpoints.ts`.
  - Repository methods `recordNodeIntent`, `checkpointNode`, `recordUsageEvent` and `finalizeRun`, which no longer batch-persists telemetry.
- **Acceptance:**
  - Each node writes a fenced intent: a state row plus a `running` history row with a deterministic id. The node is invoked only after that commit.
  - After the node returns, a fenced checkpoint transaction writes state, history, feedback and tool invocations.
  - An evaluator loop resets the target, downstream nodes and the evaluator, and advances their invocations and `loop_count`, all in the same transaction.
  - Usage is appended per LLM call with a deterministic id and is not epoch-fenced.
  - `GET /runs/:id` shows live per-node progress.
  - The first claim sets `execution_protocol = 1`. On reclaim, node state is reset and the DAG replays from the start; earlier-epoch history is kept.
  - At terminal finalize, the run's `run_node_states` rows are deleted.
  - Caps of 256 KiB per node output and 2 MiB per run fail the node with `payload_too_large`.
- **Tests (real Postgres):**
  - A stale epoch's checkpoint is rejected and leaves no partial rows.
  - Injecting a failure after the history update rolls back the whole checkpoint.
  - A second evaluator loop in the same epoch succeeds. This guards against the old `retry_count` uniqueness key.
  - A duplicate checkpoint for the same invocation and epoch is a no-op or is rejected.
  - A stale owner's usage event is recorded once, and replaying the same event id adds no tokens.
  - An oversized output fails the node.
  - Node states are gone after finalize, while history remains.
  - **Engine unit tests:** hook order, and an evaluator reset emitted as one settle event.
- **Failure scenarios:** death between intent and checkpoint; death inside the checkpoint transaction; a stale owner checkpointing after takeover; an oversized output.
- **Rollback:** previous workers replay and delete history. That is safe but loses superseded-epoch history.
- **Domain docs:** runs.md (node state, live progress, history per epoch), workers.md (persistence flow, usage accounting), usage.md (per-call usage) and architecture.md ("execution state is persisted at node boundaries").
- **PR boundary:** write path only. Recovery guarantees do not change.

## Phase 6: resume from the last checkpoint

### 6a. Side-effect contract (no behavior change for the seeded workflow)

- **Files:**
  - `packages/agent-sdk/src/{types.ts,tool-registry.ts,tools/*}`: `ToolDefinition.sideEffects`; `RunContext.idempotencyKey`; `notifications.send` makes one HTTP attempt, retries only pre-send errors and sends `Idempotency-Key`.
  - `packages/shared`: the node `sideEffects` override (stricter only), the `outcome_unknown` error code, and validation that rejects an `unsafe` node with failure retries or inside an evaluator-resettable subgraph.
- **Tests:**
  - The notifications tool is not retried on a timeout.
  - Definition validation rejects each forbidden placement.
  - The `Idempotency-Key` header is sent.

### 6b. Resume

- **Files:** `runtime/{run-checkpoints.ts,execution-state.ts,dag-engine.ts,job-runner.ts}`, the claim query (protocol filter) and `tools/llm-budget.ts` (seeding).
- **Acceptance:**
  - A protocol-2 worker sets `execution_protocol = 2` on first execution. It claims only runs with `execution_protocol <= 2` or no protocol. Protocol-1 runs are replayed.
  - On reclaim of a protocol-2 run, the worker rebuilds `ExecutionState` from `run_node_states` and never invokes `completed` nodes.
  - Interrupted `none` and `idempotent` nodes re-run the same invocation with the same key.
  - An interrupted `unsafe` node is failed with `outcome_unknown`, and so is the run.
  - `retry_count`, `invocation` and `loop_count` are restored unchanged.
  - The LLM budget is seeded from all of the run's recorded usage.
  - Quota is re-checked, and `quota_exceeded` keeps the history.
  - An `unsafe` node is not invoked when the remaining lease is less than its timeout plus margin. The run is released instead.
- **Tests (real Postgres, stub registry, test-only definition that uses P4 loops and a stub `unsafe` tool):**
  - **Death before node N's checkpoint**, then worker B reclaims: nodes 1..N-1 are not invoked, and N re-runs with the same key.
  - **Death after N's checkpoint**, before N+1's intent: B starts at N+1.
  - **Death between an `unsafe` node's intent and its checkpoint:** B does not invoke it, and the run fails with `outcome_unknown`.
  - **A stale worker A finishes N after B's takeover:** A's checkpoint is rejected and B's result is kept. A's usage is recorded.
  - **Death mid-loop** (after the evaluator's loop-reset checkpoint, before the target re-runs): resume continues with the correct `invocation` and `loop_count` and never exceeds `maxLoops`.
  - Repeated expired-lease reclaims hit the cap.
  - A pinned version that is unavailable is not claimed.
  - A protocol-1 worker does not claim a protocol-2 run.
- **Failure scenarios:** all of the above, plus a re-run of a non-deterministic node (an `input_hash` mismatch is logged).
- **Domain docs:** workers.md (resume flow, guarantees table, protocol gate), runs.md (recovery semantics, `outcome_unknown`), agents.md (side-effect classes and placement rules) and architecture.md (execution guarantees).

## Phase 7: definition-declared job parameters (customization)

- **Depends on:** P3b and P4. It can run in parallel with P5 and P6.

### 7a. Shared and API

- **Files:**
  - `packages/shared`: the parameter contract, the target-field enum (`evaluator.maxLoops`), and a JSON-schema validator moved from `apps/worker/src/runtime/schema-utils.ts`, which then imports it.
  - `definitions.ts`: adds grocery **v2.2.0**, which declares `qualityGateRetries`. v2.0.0 and v2.1.0 stay served.
  - Existing jobs stay pinned to the version they were created with, which declares no parameters. They keep `parameters = {}` and their current behavior without a backfill. Only jobs created on v2.2.0 or later get the default (D4).
  - `jobs-service.ts` and `runs-service.ts`.
  - `V21__job_parameters.sql` (`jobs.parameters jsonb not null default '{}'`).
- **Acceptance:**
  - `POST /jobs` validates inputs and parameters against the pinned version, applies defaults and rejects inputs over 64 KiB. The errors are `422 invalid_job_inputs` and `invalid_job_parameters`.
  - `POST /runs` re-validates and snapshots.
- **Tests:**
  - Unit tests for the shared validator.
  - API service and integration tests for each rejection: unknown parameter, out-of-bounds value, non-allowlisted target, invalid input, oversized input.
  - Another user's job still returns 404.

### 7b. Worker

- **Files:** `job-runner.ts`, plus the `MOCK_EVALUATOR_RETRY_TARGET` setting in `node-runner.ts` and `config.ts`.
- **Acceptance:**
  - The parameter snapshot is applied to the pinned definition before compiling, and the effective hash is recorded.
  - An unknown parameter in a snapshot fails the run.
  - The mock setting is honoured only when there is no OpenAI key, and the worker refuses to start with it when `NODE_ENV=production`.
- **Tests:**
  - With `qualityGateRetries = 0`, there is no loop.
  - With 2, there are at most 2 loops, even when the stub evaluator always requests a retry.
  - The mock setting produces exactly one loop.

### 7c. Web

- **Files:** `CreateJobPage.tsx` (parameters section, blank numbers omitted, a job-name field, API errors shown) and the `lib/api.ts` types.
- **Tests:** the web app has no harness. Verify manually and record the result in progress.md, or add a component harness if the owner agrees.

### Phase 7 scope

- **Failure scenarios:** a client bypasses the UI (API validation is the control); the version changes between job creation and enqueue (the job pin prevents it); the evaluator LLM picks an arbitrary target (`retryTargets` prevents it).
- **Domain docs:** agents.md (parameters contract), jobs.md (validation, parameters, name, version pin) and runs.md (parameter snapshot).
- **PR boundary:** one PR each for 7a, 7b and 7c.

## Phase 8: recovery visibility and controlled restart drill

- **Depends on:** P6b and P7c.
- **Files:**
  - `runs-service.ts`: hydrate the pin, epoch, recovery count, node state and protocol.
  - `RunsPage.tsx` and `DAGWorkflowViewer.tsx`: show the pinned version and the recovered, re-run, rejected-target and `outcome_unknown` states.
  - A drill script under `scripts/`.
- **Acceptance:**
  - The run detail shows the pinned version and the recovery history.
  - The drill:
    1. starts two worker processes;
    2. sets `MOCK_EVALUATOR_RETRY_TARGET=generateMeals` and adds a slow stub node;
    3. runs `kill -9` on the owner mid-loop;
    4. shows the second worker completing from the checkpoint;
    5. sends SIGTERM to a worker and shows release without a recovery count.

  Results are recorded in progress.md.
- **Tests:** an API service test for the read model. The drill provides the end-to-end evidence.

## Requirement-to-phase map

| Requirement | Phase(s) | Evidence of done |
| --- | --- | --- |
| Verify current claiming, replay, persistence, definition identity, job creation | P0, P1 | baseline; characterization tests |
| Death **before** a node checkpoint | P5, P6b | "death before N" test |
| Death **after** a node checkpoint | P5, P6b, P8 | "death after N" test; drill |
| Multiple workers, concurrent claims | P1, P2 | race test |
| Lease expiry, clock skew | P2 | DB-clock and skew test |
| Stale owners, concurrent writes, mixed-version deploys | P2, P5, P6b | ABA, rolling-fence, stale-checkpoint and protocol-gate tests |
| Poison runs; deploys not counted as crashes | P2 | cap and graceful-release tests |
| In-flight side effects; stated guarantees | P6a, P6b; feature §4 | single-attempt, placement and `outcome_unknown` tests |
| Restore inputs | P3b, P6b | edit-after-enqueue test |
| Restore outputs | P5, P6b | resume skips completed nodes |
| Restore retries and evaluator loops | P4, P5, P6b, P7b | loop-bound and mid-loop resume tests |
| Long-running async state | out of scope; feature §5 | documented limitation |
| Pin definition/version for in-flight runs | P3 | mixed-version and hash tests |
| First customization and its rationale | P7; feature §6 | validation and loop-bound tests |
| Room for fan-out and DAG authoring | P5 (`node_instance_key`), P3 (`DefinitionRef`), P7 | design review |
| Users see progress, results, failures and recovery | P5, P8 | read-model test, drill |
| Domain docs match accepted behavior | every phase | per-phase doc updates |
