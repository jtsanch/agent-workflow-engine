---
name: review-feature-design
description: Independently review a feature design against existing behavior, contracts and failure scenarios; use when asked to review a feature proposal.
---

# Review a feature design

Read repository instructions, the complete design and checkpoint, relevant roadmap/domain docs, code map and targeted existing code. If a PR is involved, resolve and report its actual base and head; distinguish local changes from reviewed commits. Build a requirement-to-contract map covering the affected boundaries, identities, state transitions, authorization and acceptance criteria.

Challenge the design with concrete sequences relevant to the change: interrupted work, retries, duplicate actions, concurrent reads/writes, stale or missing data, migrations, external failures, and version changes. Follow each invariant across affected writes, reads and consumers. Verify a candidate finding against the complete proposal and actual implementation seam; distinguish confirmed gaps from unknowns and intentional decisions.

When the request or repo workflow authorizes corrections, fix supported design defects in the feature and checkpoint, then re-read and recheck the full changed design, including sibling contracts and acceptance cases. Honor review-only requests. Escalate genuine product or architectural choices with concrete alternatives; do not invent approval requirements for routine corrections. Report prioritized remaining findings with evidence and impact, corrections, open decisions, verification limits and one next action. Do not imply proposed behavior is implemented.
