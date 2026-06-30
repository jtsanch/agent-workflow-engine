# Agent/Workflow Orchestration Audit

Audit of the workflow/task/run domain across `apps/api`, `apps/worker`, and `packages/shared`.

---

## Fixed in This PR

### F-1 · `enqueueRun` allows runs against paused or disabled jobs

**Files:** `apps/api/src/services/runs-service.ts`  
**Severity:** Medium  
**Risk:** Users can queue work against a job they have explicitly paused or that the platform has disabled, bypassing the intended lifecycle fence.

**Root cause:** `enqueueRun` checked ownership but never validated `job.status`.

**Fix applied:** Added `if (job.status !== "active")` guard before creating the run, throwing `AppError(422, "job_not_active")`.

**Before:**
```ts
if (job.userId !== userContext.userId) throw ...
// run created unconditionally
```

**After:**
```ts
if (job.userId !== userContext.userId) throw ...
if (job.status !== "active") throw new AppError(..., 422, "job_not_active");
```

---

### F-2 · `getRun` scans all user runs to locate a single run by ID

**Files:** `apps/api/src/services/runs-service.ts`  
**Severity:** Low  
**Risk:** O(n) read against `job_runs` for every `GET /runs/:runId` call. As run history grows this becomes a full-table-per-user scan. Also the pattern bypasses the existing `findById` contract on the repository.

**Fix applied:** `getRun` now calls `jobRunRepository.findById(runId)` then checks ownership by loading the parent job via `jobRepository.findById(run.jobId)`. Two targeted queries instead of one unbounded list.

**Before/After MVP decision:** Change is fully backward-compatible; same 404 semantics are preserved.

---

### F-3 · `assertSupportedNodeType` silently passes unknown node types

**Files:** `apps/worker/src/runtime/dag-engine.ts`  
**Severity:** Low  
**Risk:** If a DAG definition introduces a new node type that is not yet handled in `executeNodesBatch`, the function will silently return, `runNode` will fall through its switch with `result = undefined`, and the execution will persist a succeeded node execution with null output. The downstream `validateSchema` call on the output will then likely throw—but the error path is indirect and hard to diagnose.

**Fix applied:** Added an exhaustive `default` case that throws `Error("Unsupported node type: ...")`. TypeScript's `never` assignment also provides compile-time exhaustiveness checking.

---

## Design Issues (No Change This PR)

### D-1 · Non-idempotent run creation — no duplicate-run guard

**Files:** `apps/api/src/services/runs-service.ts`  
**Severity:** Medium  
**Risk:** A user (or a misbehaving client) can submit multiple `POST /runs` requests in quick succession and create several queued runs for the same job. The worker will execute all of them, consuming quota for each. There is no uniqueness constraint or deduplication window.

**Recommended fix:** Add a uniqueness guard in `enqueueRun`: reject (or return the existing run) if there is already a run in `queued` or `running` state for the same job. This requires either a DB-level partial unique index or a service-level read-before-write (with the inherent TOCTOU caveat).

**Before/After MVP decision:** A partial unique index on `(job_id, status)` where `status IN ('queued', 'running')` would be safe for MVP and could be done with a single Flyway migration and a repository-level upsert-or-return pattern.

---

### D-2 · `startedAt` is set at queue time, not at worker claim time

**Files:** `apps/api/src/services/runs-service.ts`, `apps/api/src/db/schema/runs.ts`  
**Severity:** Low  
**Risk:** `job_runs.started_at` is `NOT NULL` and is set to `NOW()` when the API creates the queued run. The worker never updates it when it claims the run. This means `startedAt` actually records "enqueued at", not "execution started at". The two semantics diverge whenever runs sit in the queue for any meaningful time.

**Recommended fix:** Make `started_at` nullable in the schema (Flyway migration), set it `NULL` in `enqueueRun`, and have the worker set it in the `claimNextQueuedRun` `UPDATE` statement alongside `claimed_at`. This is a schema migration and a cross-runtime contract change.

**Before/After MVP decision:** Schema migration required. Defer until run observability UI is built and the distinction between "queued at" and "started at" becomes user-visible.

---

### D-3 · Multi-step telemetry writes occur outside a single atomic transaction

**Files:** `apps/worker/src/runtime/queue-worker.ts`, `apps/worker/src/repositories/postgres/worker-persistence-repository.ts`  
**Severity:** Medium  
**Risk:** After `runJob` completes, the worker writes:
1. `persistNodeExecutions` (per-row, individual statements)
2. `persistNodeFeedback` (per-row, individual statements)
3. `persistToolInvocations` (per-row, individual statements)
4. `upsertJobMemories` (per-row, individual statements)
5. `finalizeRun` (single transaction: usage events + run status update)

If the worker process crashes between steps 1 and 5, the database will have partial telemetry for a run that is still in `running` state. The cleanup is handled by `clearRunReplayArtifacts` when the next worker reclaims the expired lease. While this is functionally correct, the reclaim-and-clear window means:
- Any read of the run during this window may see partial telemetry.
- A crash between steps 4 and 5 (after memories are written but before the run is finalized) leaves orphaned memory writes for a run that will be replayed from scratch.

**Recommended fix:** Wrap all five steps in a single client transaction in `finalizeRun`. Move `persistNodeExecutions`, `persistNodeFeedback`, `persistToolInvocations`, and `upsertJobMemories` into the `finalizeRun` transaction body and pass them in the `FinalizeRunRecord`. The lease guard on each intermediate write can be removed once they are inside the same transaction.

**Before/After MVP decision:** This is a meaningful refactor of `WorkerPersistenceRepository` and `FinalizeRunRecord`. The current behavior is safe (cleanup-on-reclaim is tested). Defer unless partial-telemetry reads become a product concern.

---

### D-4 · `listJobs` issues N+1 queries for schedules and alert preferences

**Files:** `apps/api/src/services/jobs-service.ts`  
**Severity:** Low  
**Risk:** `listJobs` issues one `findByJobId` query per job for schedules, and one `listByJobId` query per job for alert preferences. For a user with N jobs this is 2N+1 queries. Not a correctness issue at current scale.

**Recommended fix:** Add `listByJobIds(jobIds: string[])` methods to `JobScheduleRepository` and `AlertPreferenceRepository` and load both in bulk after fetching the job list.

**Before/After MVP decision:** Performance optimization. Defer until profiling shows it matters.

---

### D-5 · Node execution and tool invocation IDs use `Math.random()`

**Files:** `apps/worker/src/runtime/dag-engine.ts` (`createFailureExecution`), `apps/worker/src/runtime/node-runner.ts` (`createId`)  
**Severity:** Low  
**Risk:** IDs for `NodeExecution` and `NodeFeedback` are generated with `Math.random().toString(36)`. These have ~40 bits of entropy and are not RFC 4122 UUIDs. Collision probability is negligible in practice but the pattern diverges from the `randomUUID()` used elsewhere in the worker persistence repository (`upsertJobMemories`). On lease reclaim, `clearRunReplayArtifacts` deletes all previous telemetry for the run, so duplicate IDs between replay attempts are not a persistence concern.

**Recommended fix:** Replace `Math.random().toString(36)` with `randomUUID()` from `node:crypto` for consistency. Low-priority.

---

### D-6 · `memory` DataRef source is not implemented

**Files:** `apps/worker/src/runtime/input-resolver.ts`  
**Severity:** Medium  
**Risk:** The `memory` case in `resolveDataRef` throws `"Memory not supported yet"`. Any DAG node that binds input from a `{ source: "memory" }` ref will fail at runtime with an unhandled error that propagates as a `DAGExecutionError`. The `JobMemory` domain type, `job_memories` table, and `upsertJobMemories` persistence path all exist, so the infrastructure is in place.

**Recommended fix:** Implement the `memory` resolver by loading the relevant job memory record at DAG-execution time and injecting it into the execution state. This likely requires passing `jobId` through to `resolveDataRef`.

**Before/After MVP decision:** This is a feature gap, not a regression. Defer until a DAG uses memory bindings.

---

### D-7 · `getOrCompileDAG` cache key falls back to `JSON.stringify`

**Files:** `apps/worker/src/runtime/compile-dag.ts`  
**Severity:** Low  
**Risk:** The compile cache uses `agentDefinition.id` as the key, falling back to `JSON.stringify(agentDefinition.dag)` when `id` is absent. `JSON.stringify` output is not stable across Node.js versions or object key ordering. If the same logical DAG serializes differently across worker restarts (e.g., after a code change that reorders fields), the cache will produce separate entries for the same DAG. This is a memory concern, not a correctness issue, because each compile produces an equivalent result.

**Recommended fix:** Ensure all `AgentDefinition` records have a stable non-empty `id`. Since `AgentDefinition.id` is required in the type, this is likely already satisfied in practice.

---

## Missing Tests (Not Added This PR)

| Gap | Location | Notes |
|-----|----------|-------|
| Worker: `persistNodeExecutions` partial failure followed by reclaim correctly clears telemetry | `queue-worker.integration.test.ts` | The `loseOwnershipOnPersistNodeFeedbackRuns` path is tested; a similar path for `persistNodeExecutions` partial failure (crash before feedback write) is not. |
| API: `enqueueRun` with concurrent duplicate requests | `runs-service.unit.test.ts` | Depends on D-1 being resolved first. |
| Worker: `resolveDataRef` throws for `memory` source | `input-resolver.unit.test.ts` | Documents the known limitation so future implementers catch the gap. |

---

## Test Results (Baseline Before This PR)

```
apps/api unit tests:   36 passed
apps/worker unit tests: all passed
```

All existing tests continue to pass after the changes in this PR.
