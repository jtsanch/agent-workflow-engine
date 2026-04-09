# ADR 001: Why Monorepo

## Status

Accepted

## Context

The platform spans a web app, API, worker runtime, shared schemas, agent definitions, and infrastructure code. These pieces evolve together and benefit from strict shared types.

## Decision

Use a pnpm workspace monorepo with Turbo for task orchestration.

## Consequences

- Shared domain types and Zod schemas stay version-aligned
- Refactors across web, API, and worker are easier to coordinate
- Infrastructure and application code can evolve in a single review stream

