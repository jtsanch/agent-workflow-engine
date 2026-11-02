---
name: review-pr-walkthrough
description: Create a code-reading walkthrough of a PR or branch stack, including behavior, evidence and material concerns; use when the user asks to understand a change.
---

# PR walkthrough

Resolve PRs or explicit comparisons, current base/head SHAs and merge bases. For a stack identify each immediate parent and analyze each delta separately before any cumulative view. Inspect relevant instructions, architecture and feature records, actual diffs, callers, callees, registration, tests and live CI. Avoid disturbing the checkout. If requirements or a comparison are unavailable, say so.

Explain the trigger, old and new behavior and system context in an explicit reading order based on runtime flow. For each changed area identify the responsible file and symbol, inputs, outputs, state changes and key unchanged collaborators. Trace a concrete happy path and relevant failure, concurrency, identity and persistence flows. Cover all changed files or explain their supporting role. Include concise diagrams where they aid understanding and source links pinned to the analyzed revision.

Separate confirmed defects, potential concerns, verification gaps and open questions. Cite evidence, impact and correction for a defect; say what would resolve uncertainty for a concern. Map important behavior to observed tests and distinguish CI, tests actually run and checks unavailable. Do not present a walkthrough as an independent correctness approval.

When an HTML artifact is requested, make a single self-contained offline document with accessible navigation, escaped source text, responsive styling and embedded diagrams. Verify layout and links when possible; report limits. Never include secrets or raw sensitive data. Do not publish, commit, comment on a PR or change application state without the required authorization. Recheck the PR head at handoff and label a stale snapshot. Return the artifact, revisions, findings, verification limits and an independent-review handoff.
