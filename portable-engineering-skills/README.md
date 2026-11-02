# Portable engineering skills

A portable feature-development workflow, from design through closeout. It contains no project-specific requirements. Each skill reads the active repository's own instructions and records before acting; explicit user instructions and existing authorization take precedence.

## Contents

- `skills/design-feature`: turn a feature idea into a reviewable design.
- `skills/plan-feature-phases`: break a design into bounded, verifiable phases.
- `skills/resume-feature`: reconstruct status and identify the next action.
- `skills/review-feature-design` and `skills/review-feature-plan`: independently review proposals and phase plans.
- `skills/implement-feature-phases` and `skills/review-feature-phases`: implement and independently review bounded phases.
- `skills/integrate-feature-findings`: verify findings, fix their root causes and hand off for re-review.
- `skills/change-feature-scope` and `skills/complete-feature`: reconcile material changes and close verified work.
- `skills/review-pr-walkthrough`: explain a PR or stack in code-reading order.

For substantial work, the intended loop is design → independent design review → phase plan → independent plan review → bounded implementation → independent phase review → integrate findings → re-review → verified closeout. Apply the scope and approval boundaries the owner and repository actually establish; do not treat this suggested loop as authorization to post, merge or deploy. Use feature, plan and progress records when the repository has them. A handoff should identify the current state, relevant refs and evidence, decisions, and one next action. When a new session or agent is useful, provide a copy-paste prompt with resolved paths, exact phase range, PRs and verified base/head SHAs, plus open questions and what evidence would resolve them.

## Installation

After obtaining this library from its reviewed repository, install each complete skill directory into the skill-discovery location for the agent you use. For Codex, the user-level skill-creator workflow uses `${CODEX_HOME:-$HOME/.codex}/skills`; for Claude Code, consult its current skill documentation for user-level installation. Use copies or links only where supported by your environment. Start a new session if newly installed skills are not discovered. Review and update the installed copy when this library changes; installations do not automatically update.

For example, from a trusted checkout, to install these for Codex:

```sh
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R skills/* "${CODEX_HOME:-$HOME/.codex}/skills/"
```

Inspect existing directories first: do not overwrite locally modified skills. These skills do not install themselves or perform external actions without the user's authorization. Repository-local instructions may specify stricter workflow and file locations.
