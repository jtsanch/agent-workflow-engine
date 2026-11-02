---
name: plan-feature-phases
description: Turn an existing feature design into bounded implementation phases with dependencies and verification; use when asked to plan or refine a substantial feature.
---

# Plan feature phases

Read applicable repository instructions, the feature design and checkpoint, relevant architecture and domain documentation, and targeted code. Identify the existing decisions, remaining uncertainty, and the full set of requirements. Honor any scope already authorized by the user and any repository-specific planning requirements.

Create or refine the plan and checkpoint using the project's conventions. For each small reviewable phase specify its scope and dependencies, verified likely files and ownership, schema/API/domain/UI/test work as applicable, domain-doc updates, acceptance criteria and focused, CI, integration or manual verification as appropriate. Assign relevant failure paths to phases. Map every in-scope requirement to a phase; identify omissions and stale assumptions. Specify independent versus stacked PR bases from actual branch dependencies; do not assume a particular base branch.

Identify decisions that materially change scope or prevent implementation. Report a phase table, requirement coverage, outstanding risks and one next action. When helpful, include a ready-to-paste independent plan-review handoff with the feature path, exact scope, relevant refs if verified, and open questions. Do not implement solely because a plan was requested.
