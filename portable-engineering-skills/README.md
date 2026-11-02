# Portable engineering skills

Three agent skills for designing, planning, and resuming repository work. They contain no project-specific requirements. Each skill reads the active repository's own instructions and records before acting; explicit user instructions take precedence.

## Contents

- `skills/design-feature`: turn a feature idea into a reviewable design.
- `skills/plan-feature-phases`: break a design into bounded, verifiable phases.
- `skills/resume-feature`: reconstruct status and identify the next action.

## Installation

After obtaining this library from its reviewed repository, install each complete skill directory into the skill-discovery location for the agent you use. For Codex, the user-level skill-creator workflow uses `${CODEX_HOME:-$HOME/.codex}/skills`; for Claude Code, consult its current skill documentation for user-level installation. Use copies or links only where supported by your environment. Start a new session if newly installed skills are not discovered. Review and update the installed copy when this library changes; installations do not automatically update.

For example, from a trusted checkout, to install these for Codex:

```sh
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R skills/design-feature skills/plan-feature-phases skills/resume-feature "${CODEX_HOME:-$HOME/.codex}/skills/"
```

Inspect existing directories first: do not overwrite locally modified skills. These skills do not install themselves or perform external actions without the user's authorization. Repository-local instructions may specify stricter workflow and file locations.
