# Trustworthy, customizable execution: checkpoint

Updated: 2026-11-03

- **Status:** design and plan revised in a reconciliation pass and **awaiting independent re-review**. Nothing is implemented, and nothing is committed or merged.
- **Source of this revision:** the 2026-11-02 records (untracked on the owner's machine at `~/projects/agent-workflow-engine/docs/features/todo/trustworthy-customizable-execution/`). They were recovered from that session's write history and reconciled against `origin/develop`. **Any edits made locally after 2026-11-02 15:58 PT were not visible to this pass and must be merged by hand.**
- **Location of this revision:** the working tree of a cloud session at `develop` `1f14d162`. It is uncommitted and not pushed.

## Refs (verified 2026-11-03 against GitHub)

- `origin/develop` = `1f14d162` (#26, portable skills; `portable-engineering-skills/` only). Its parent is `4a7317a3`, the squash-merge of **#24** on 2026-09-28.
- **`5befd577` and `899fdf97` need no baseline PR.** Both are the only commits of `copilot/audit-improve-agent-workflow-orchestration-layer`, which merged as #24. `git diff 4a7317a3 899fdf97` is empty. The five touched files are identical on `develop` today. The 2026-11-02 records misdescribed them:
  - `5befd577` holds all of the code: the active-job guard, `getRun` ownership, the exhaustive node-type check and the tests.
  - `899fdf97` is a one-line README change ("forcing workflow run").

  The local `origin/develop` ref (`4991dad4`) was stale. That is why the branch looked 2 commits ahead.
- **PR #25** (pg-boss) was **closed unmerged** on 2026-11-03. Its branch `bugfix/lower-db-cost` remains.
- `docs/features/README.md` and `docs/features/roadmap.md` are referenced by these records but are **not on `develop`**. They are untracked on the owner's machine.

## Verification

Ran on `develop` `1f14d162` (2026-11-03, cloud container, after `pnpm install` + `pnpm build`):

| check | result |
| --- | --- |
| `pnpm --filter @personal-agent-os/worker test` | 13 files, 97 tests passed |
| `pnpm --filter @personal-agent-os/agent-sdk test` | 5 files, 13 tests passed |
| `pnpm typecheck`, `pnpm lint` | passed |
| `pnpm --filter @personal-agent-os/api test` | 54 passed, 5 skipped. The 2 Postgres testcontainer files failed with no Docker daemon, which is an environment failure, not a code failure. |
| `pnpm db:validate` | not run: it needs `DATABASE_URL` |
| baseline code claims | re-read on `develop`; see "Baseline" in feature.md |

Not run, so these remain unverified:

- the 2026-11-02 Postgres probe (no Docker; the code under test is unchanged);
- browser flow with Clerk;
- live OpenAI or webhook;
- multi-process `kill -9`;
- the transient-heartbeat crash path (code reading only);
- any deployed environment.

## Reconciliation findings (2026-11-03)

These come from reconciling the records against the review requirements (the seven areas in the review prompt) and the code. This is **not** the independent review. Severity: **H** breaks a stated guarantee or blocks implementation; **M** is a contradiction or gap that would cause rework; **L** is a correction.

| # | sev | finding | evidence | disposition |
| --- | --- | --- | --- | --- |
| R1 | H | `idempotency_key = run:node:attempt` and the `node_executions` key `(run, node, retry_count, epoch)` collide after an evaluator loop. Downstream nodes and the evaluator keep their `retry_count`, so the second loop would reuse keys (an idempotent provider returns the stale result) and violate uniqueness (the run fails). | `execution-state.ts:155–162`, `retry-manager.ts:90–92` | Added the `invocation` counter. Keys and uniqueness use it, and `retry_count` stays the budget counter (feature §3, P4, P5). |
| R2 | H | "Never invokes an `unsafe` node again" was not enforceable: `notifications.send` retries `POST` up to 3× on timeout inside one attempt, and failure retries or evaluator resets would re-run an `unsafe` node. | `base-tool.ts:29–63`, `notifications-send-tool.ts:28–42`, `dag-engine.ts:201` | Guarantee narrowed to "at most once per run, one HTTP attempt". Enforcement added: a single attempt, placement validation, and a lease-margin check (feature §4, P6a). |
| R3 | H | Fencing on epoch *instead of* worker id is unsafe during the rolling deploy: a pre-epoch worker reclaims without bumping the epoch, so both owners pass the fence. | design §1 vs. claim SQL `worker-persistence-repository.ts:96–111` | Fence on worker id **and** epoch, with a rolling-fence test (P2). |
| R4 | H | Replay workers from Phase 4 (now P5) can reclaim runs that resume workers started and re-invoke their interrupted `unsafe` nodes during the deploy. | plan phases 4 and 5 | `execution_protocol` column with a claim filter (feature §3, P5, P6b). |
| R5 | H | Job inputs and parameters were validated at `POST /jobs` but pinned at `POST /runs`, so the version could differ between validation and execution. | design §2 vs. P6 "validated against the version pinned at enqueue" | The job pins its version at creation; enqueue re-validates and snapshots (feature §2, P3b, P7a). |
| R6 | H | Changing a served definition (adding the evaluator contract, then parameters) under the same version would fail queued runs with `definition_hash_mismatch`. | P3 hash check + P6 definition edits | Version-bump rule: v2.1.0 and v2.2.0, with old versions still served (plan rules, P4, P7a). |
| R7 | M | `qualityGateRetries` → `validatePlan.execution.retryPolicy.maxRetries` was ambiguous and unbounded. That field also enables failure retries of the evaluator. The gate is per target, so loops multiply by the number of targets. The LLM may name any node, including itself (the default). | `retry-manager.ts:46–96`, `dag-engine.ts:201` | New `evaluator.maxLoops` and `retryTargets`, with an evaluator-scoped `loop_count` (feature §6, P4). |
| R8 | M | The old P5 mid-loop resume test needed retries, which only the old P6b made reachable, yet P6 was declared "independent of P4/P5". | old plan | Loop semantics moved to their own P4; P6b tests use a test-only definition. |
| R9 | M | Graceful shutdown never releases the lease (`process.exit(1)` after the grace period), so each deploy during a long run counts against the recovery cap. With a cap of 3, three deploys would fail a healthy run. | `start.ts:36–70` | Release at a node boundary without a recovery count. `recovery_count` counts only expired-lease reclaims (feature §1, P2). |
| R10 | M | Lost-work tokens are unrecorded, and the budget is seeded only from committed usage, so a poison run spends up to (cap + 1) × budget invisibly. | `queue-worker.ts:116–125`, `finalizeRun` | Per-call usage events that are not epoch-fenced, with deterministic ids (feature §3, P5). Owner decision D9. |
| R11 | M | D6 duplicated full inputs and outputs in a second long-lived table and gave no cap rationale. | design §3 table | `run_node_states` stores only `input_hash` and output and is deleted at finalize. Caps are defined (feature §8, P5). |
| R12 | M | The Phase 0 boundary ("no domain-doc changes") and Phase 1 ("Domain docs: none … fix the stale runs.md statement") contradicted each other. | old plan | P1 explicitly corrects statements that are already false. P0 stays docs/features only. |
| R13 | M | The resume path would re-check quota at every claim; the behavior wasn't stated. | `queue-worker.ts:54–60` | Stated: resume fails with `quota_exceeded` and keeps history (feature §3, P6b). |
| R14 | M | The heartbeat "deadline" was undefined once leases moved to the DB clock. | design §1 | Renew returns the remaining lease; the deadline is set on a local monotonic clock (feature §1, P2). |
| R15 | L | Refs were stale: `develop` already contains `5befd577`/`899fdf97` (#24), the commit descriptions were swapped, and PR #25 is closed. | GitHub, `git diff` | D1 and D2 closed; the baseline was re-based on `develop`. |
| R16 | L | runs.md also gives the claim order as `started_at`; it is `queued_at`. A `running` row with a null lease is never reclaimed. | `runs.md:235`, claim SQL | Added to the P1 doc fixes and characterization tests. |
| R17 | L | `memoryWrites` is always empty, so `job_memories` is not part of the checkpoint protocol. | `dag-engine.ts:385` | Recorded in the baseline. Any future memory write must join the checkpoint transaction. |
| R18 | L | The usage-counter reset is an unfenced absolute write that races with `finalizeRun`'s increment. | `worker-persistence-repository.ts:213–226` | Recorded in the baseline. Not fixed by this feature; candidate follow-up. |

## Open decisions

| # | Decision | Recommendation | Status | Blocks |
| --- | --- | --- | --- | --- |
| D1 | PR #25 (pg-boss delivery) | Closed unmerged on 2026-11-03. Constraint: any future delivery mechanism only wakes workers; `job_runs` claim and fence stay authoritative. | **Closed**; owner to confirm the constraint | — |
| D2 | Base for feature PRs | `develop`. `5befd577`/`899fdf97` are already there through #24, so **no baseline PR**. | **Closed** | — |
| D3 | Interrupted `unsafe` node | Fail closed with `outcome_unknown`. A manual resolve/retry API comes later. Now enforced by the P6a rules. | Recommended | P6 |
| D4 | First customization: details | `qualityGateRetries`, integer 0–2, **default 1** for jobs created on v2.2.0+. It sets `validatePlan.evaluator.maxLoops`, with `retryTargets = [generateMeals, estimateNutrition, calculateCosts]` and an evaluator-scoped loop count. Earlier jobs keep their version and behavior. `MOCK_EVALUATOR_RETRY_TARGET` is a worker setting for non-production, mock-LLM use only, so the loop is observable without OpenAI. Alternatives: default 0 (opt-in; no cost change for new jobs), or model selection (needs an allowlist and cost policy). | **Owner to confirm** the default and the mock setting | P4, P7 |
| D5 | Version retention and unserved runs | (a) Every version stays in code and served for this whole feature; retirement is a follow-up. (b) A version may be retired only when no non-terminal run and no active job pins it, checked by a script before the removal PR. (c) Enqueue against a retired version returns `409 definition_version_retired`. (d) Runs pinned to an unserved version stay `queued`, with no automatic failure. The worker logs a warning and emits a `runs_queued_unserved{key,version}` count when one is older than 15 minutes (checked every 60 s). Manual failure is a documented SQL runbook step. | **Owner to confirm** | P3 |
| D6 | Node payload caps and retention | 256 KiB per node output and 2 MiB per run (UTF-8 bytes of the JSON), giving non-retryable `payload_too_large`; 64 KiB for job inputs at the API. `run_node_states` is deleted at terminal finalize. `node_executions` keeps today's retention: kept with the run, with no deletion path. Payloads are never logged. A user data-deletion path is a separate follow-up. | **Owner to confirm** | P5, P7a |
| D7 | First real long-running async operation | None in this feature; choose during the durable-pickup design. | Recommended | — |
| D8 | Recovery cap | 3 expired-lease recoveries per run (`WORKER_MAX_RECOVERIES`). Graceful releases don't count. | Recommended | P2 |
| D9 | Usage from superseded epochs (new) | Record it: per-call usage events are exempt from the epoch fence, so quota and the budget see real spend. Trade-off: a run can show usage from work whose results were discarded. | **Owner to confirm** | P5 |
| D10 | Graceful release on SIGTERM (new) | Release to `queued` at the next node boundary after checkpoint, without bumping `recovery_count`. Before P5 this means a replay from the start, as today. | Recommended | P2 |

## Review findings

The independent review has not run on the revised records yet. Record its findings and their dispositions here.

## Next action

1. Merge any local edits made after 2026-11-02 into this revision.
2. Commit the records and the local `docs/features/README.md` and `roadmap.md` as a docs-only change, then run the re-review below.
3. The owner can answer D4, D5, D6 and D9 in parallel.

```text
Independently re-review the revised design and phase plan at
docs/features/todo/trustworthy-customizable-execution/ (feature.md, plan.md,
progress.md) in jtsanch/agent-workflow-engine. Also read AGENTS.md,
docs/domains/{runs,workers,agents,jobs,usage}.md and
docs/architecture/architecture.md.

Base: origin/develop 1f14d162 (verify it is still current). PR #25 is closed;
commits 5befd577/899fdf97 are already on develop through #24. Do not implement,
commit to develop, or merge anything.

1. Re-check every baseline claim in feature.md against develop. Mark each
   claim confirmed, wrong or unverifiable.
2. For each reconciliation finding R1–R18 in progress.md, decide whether
   the disposition actually closes it. Give a concrete failure sequence for
   any that it doesn't.
3. Attack the revised protocol with ordered failure sequences (steps,
   resulting state, and the test that detects it):
   - the dual worker-id + epoch fence during a rolling deploy;
   - graceful release racing a takeover;
   - the DB-clock deadline;
   - intent-before-invoke;
   - checkpoint atomicity, including the evaluator loop reset;
   - the invocation counter and its uniqueness keys;
   - usage events that are not epoch-fenced (double counting, quota);
   - the execution_protocol gate across the P5→P6b deploy;
   - unsafe-node enforcement (single HTTP attempt, placement validation,
     lease margin).
4. Definition pinning: job pin at creation vs. run snapshot at enqueue;
   transformVersion as hash coverage for transform code; the version-bump
   rule (v2.1.0, v2.2.0); legacy jobs and runs; unserved versions (D5).
5. Customization (D4): evaluator.maxLoops, retryTargets, evaluator-scoped
   loop count, the default value, MOCK_EVALUATOR_RETRY_TARGET, and the
   API validation path.
6. Plan: phase order (P4 before P5, P7 parallel), dependencies,
   migrations and rollback, tests that actually detect each named failure,
   domain-doc updates, PR boundaries.
7. Is D6 (caps, deleting node states at finalize, retention) adequate
   for dietary and allergy data?

Report findings ranked by severity, each with evidence (file:line or doc
section), impact and a concrete fix. List the decisions (D1–D10) you would
change and why. State which checks you ran and which you could not.
```
