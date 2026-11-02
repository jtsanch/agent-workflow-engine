---
name: resume-feature
description: Reconstruct a feature's current state, blockers, and next action from repository evidence; use when asked for a feature handoff or to resume planning work.
---

# Resume a feature

Locate the feature using the user's context and repository records. Read applicable repository instructions, the feature design, phase plan and progress record when present, relevant domain documentation, and only the code needed to resolve discrepancies. Where available, check the current PR, branch, review and CI state rather than treating an old checkpoint as live truth. State explicitly when a source cannot be checked.

Report four concise items: current state; material changes since the last checkpoint; blockers or unresolved decisions; and one next action with its owner. Support discrepancies with evidence. If the user requested only a status, do not start implementation; update a checkpoint only when authorized or needed under the applicable repository workflow. If the user also requested execution, continue within that scope.

When useful, provide a ready-to-paste next-action prompt with the feature path, exact scope, verified PR/base/head references, and questions the next session must answer.
