---
name: integrate-feature-findings
description: Verify and resolve named feature design, plan, or implementation review findings within the authorized scope.
---

# Integrate findings

Read the findings, relevant feature and phase records, repository instructions, affected code, diffs and tests. Verify each finding against the current revision. Fix confirmed problems in their owning design, plan, code, test or domain documentation, or explain with evidence why they do not apply.

Identify the violated invariant or root cause and inspect related sibling write, conflict, event, schema and read surfaces where it can recur. Reconcile migration/schema and direct invariant tests when persistence is affected. Preserve prior work and the authorized scope; record rather than silently expand material requirements.

For substantive design or plan corrections, recheck the complete revised artifact against its contracts and acceptance cases. For code fixes run focused checks and the relevant phase regression checks; include transition, constraint, mismatch, retry or concurrency checks where the finding requires them. Update the checkpoint and PR only when authorized. Modify a shared prompt or skill only when the finding demonstrates a reusable instruction gap.

Report a finding-to-disposition map, sibling audit, checks, unresolved issues and one next action. Hand material fixes to an independent re-review; do not merge or start unrelated work without authorization.
