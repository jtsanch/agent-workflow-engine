# ADR 003: Why Config-Driven UI

## Status

Accepted

## Context

New agent experiences should be easy to introduce without rebuilding bespoke frontend forms for every workflow.

## Decision

Store simple UI schema alongside each agent definition and render Create Job forms from that schema.

## Consequences

- The frontend can remain thin and reusable
- Agent onboarding becomes mostly a configuration exercise
- Validation stays aligned with shared schemas and backend contracts

