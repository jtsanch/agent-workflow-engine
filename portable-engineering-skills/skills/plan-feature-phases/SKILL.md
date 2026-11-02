---
name: plan-feature-phases
description: Turn an existing feature design into bounded implementation phases with dependencies and verification; use when asked to plan or refine a substantial feature.
---

# Plan feature phases

Read applicable repository instructions, the feature design and checkpoint, relevant architecture and domain documentation, and targeted code. Identify the existing decisions, remaining uncertainty, and the full set of requirements. Honor any scope already authorized by the user and any repository-specific planning requirements.

Create or refine a plan using the project's existing conventions. Define small reviewable phases with dependencies, concrete outcomes, likely ownership and files, acceptance criteria, meaningful verification, failure scenarios, and documentation updates. Where phases require unmerged changes, explain their branch and PR dependencies; do not assume a particular base branch. Map requirements to phases and surface missing or conflicting requirements rather than silently dropping them.

Identify decisions that materially change scope or prevent implementation. Report the planned phases, outstanding risks, and one next action. When helpful, include a ready-to-paste handoff with the feature path, exact scope, relevant refs if verified, and open questions. Do not implement solely because a plan was requested.
