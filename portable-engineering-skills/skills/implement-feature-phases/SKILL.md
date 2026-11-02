---
name: implement-feature-phases
description: Implement a specified, authorized feature phase or bounded phase range with reviewable checkpoints and verification.
---

# Implement feature phases

Read repository instructions, feature design, plan, checkpoint, linked domain docs, code map, relevant code/tests and available live PR/CI state. Resolve the authorized phase range, dependency order and actual branch bases. Implement only the named scope. Do not assume a particular branch or merge authorization.

Before each phase, extract its invariants and map them to enforcement points and tests. For persistence changes, inspect ownership relationships, identity and uniqueness, migrations versus schema definitions, write/conflict/update paths, mutable state versus historical records, locking, and current versus historical reads where relevant. An individual foreign key or happy-path test may not prove a relationship across records; use direct mismatch and constraint tests where the invariant requires it. Check sibling surfaces carrying the same invariant.

Implement each phase following the plan. Update contracts, migrations, tests and domain docs to reflect accepted behavior. Reconcile the diff against the design and invariants. Run relevant focused checks, migration/schema drift checks for persistence changes, and the phase's broader required checks. Record tests run and not run, results, invariant coverage, PR/branch/base and one next action in the checkpoint. Create reviewable commits or PRs when requested or authorized. Preserve dependent branch history; do not erase work to split PRs.

Stop at the named boundary or when failure, an unresolved dependency or a material scope decision prevents safe progress. Report each phase's changes, verification, blockers and review handoff. Independent review of each phase is part of the handoff; do not merge unless explicitly authorized.
