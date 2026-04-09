# ADR 002: Why Jobs Are First-Class

## Status

Accepted

## Context

The core product promise is recurring agent execution with user-visible configuration, scheduling, alerts, memory, and feedback.

## Decision

Model `Job` as the primary operational abstraction that binds:

- an `AgentDefinition`
- an input configuration payload
- a `JobSchedule`
- one or more `AlertPreference` records
- execution history via `JobRun`

## Consequences

- Scheduling, alerting, and observability can center on one stable identifier
- The UI can focus on job lifecycle management instead of lower-level prompts
- Future orchestration layers can operate around a durable job contract

