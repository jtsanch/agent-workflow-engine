---
name: design-feature
description: Develop a reviewable feature design from a request using the current repository's architecture and feature records; use when asked to design or capture a substantial feature.
---

# Design a feature

Read applicable repository instructions, existing feature records, relevant architecture and domain documentation, and targeted code. Resolve the intended feature and avoid creating a competing record. Treat code inspection, observed runtime behavior, existing intent, and proposed changes as distinct evidence.

Use the repository's feature location and template when available; otherwise create an appropriately scoped feature record and checkpoint. Capture the outcome and rationale, explicit requirements and exclusions, ownership boundaries and likely files; schema, migrations, APIs, validation, authorization and data flows where relevant; invariants, failures and recovery; acceptance and verification; unresolved decisions. Mark irrelevant sections as such. Flag conflicts with domain docs and code. Do not portray proposed behavior as current behavior in domain docs.

For a handoff, summarize the design, evidence gaps, decisions requiring the owner, and one next action. When useful, provide a ready-to-paste prompt for independent design review with the feature path, scope, relevant evidence and open questions. Honor repository review conventions and approvals already granted; do not treat a design-only request as permission to implement.
