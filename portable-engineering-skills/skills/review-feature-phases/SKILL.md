---
name: review-feature-phases
description: Independently review named feature phase diffs and their failure-path coverage against the design, plan and current code.
---

# Review feature phases

Resolve the exact named phase range, repository, PRs, branch bases and head SHAs. Read instructions, design, plan, checkpoint, domain docs, code map, diffs, relevant code/tests and live CI where available. For stacked PRs inspect each phase against its immediate parent; do not substitute one cumulative diff for every phase.

Review each phase separately for requirement coverage, correctness, regressions, authorization, relevant performance, domain documentation and verification. Inventory applicable invariants and trace them across affected schema/migrations, repository writes and conflict paths, events, interfaces and current/historical reads. Check sibling surfaces for the same invariant. For persistence, verify ownership and identity enforcement, schema/migration agreement, locking, retries and transitions where relevant. A test counts as coverage only if it would detect the handling failing.

Apply relevant failure lenses as separate passes: asynchronous claims and recovery; concurrency and locking; persistence and identity; migrations and rollout; API contracts and errors; external provider failure. For each triggered lens describe the triggering event sequence, expected behavior and evidence or test; use only applicable lenses. Distinguish confirmed defects, uncertainty and verification gaps. Give actionable findings with file/line evidence, impact and a fix; distinguish new defects from pre-existing issues.

Report findings per phase, invariant and test gaps, checks run or unavailable, unresolved risks and one next action. Follow the user's authorization and repository rules for PR comments; do not assume permission to post, approve, request changes or merge. If review-only, do not rewrite implementation. Re-review material fixes independently.
