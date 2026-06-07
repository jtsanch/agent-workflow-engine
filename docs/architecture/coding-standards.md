# Coding Standards

This document defines durable engineering conventions for the repository.

## Architectural Conventions

- Preserve the control-plane versus execution-plane split.
- Keep cross-runtime contracts in shared packages.
- Prefer stable domain contracts over runtime-local duplicated types.
- Avoid coupling the web directly to database or worker implementation details.
- Avoid coupling the worker to HTTP-facing concerns.

## API Standards

- Keep controllers thin.
- Put validation, authorization-aware orchestration, and policy in services.
- Keep persistence access behind repository boundaries.
- Return UI-facing read models deliberately rather than leaking storage records by default.
- Treat auth, admin access, ownership, and usage limits as platform concerns, not optional middleware add-ons.

## Worker Standards

- Treat the worker as the owner of asynchronous execution semantics.
- Keep queue handling separate from reusable execution-engine logic.
- Model workflow execution around contracts, state transitions, and telemetry.
- Prefer deterministic execution behavior over implicit side effects.

## Frontend Standards

- Keep pages responsible for screen orchestration.
- Keep reusable components presentation-focused.
- Use the API client layer as the browser-to-backend boundary.
- Prefer config-driven rendering where workflow input is definition-owned.
- Do not duplicate backend policy in the UI.

## Shared Contract Standards

- Shared schemas are the source of truth for request and domain validation contracts.
- Shared types should describe durable business concepts, not temporary runtime shortcuts.
- Changes to shared contracts should be intentional because they affect multiple runtimes.

## Naming Conventions

- Use clear domain names over technical shorthand.
- Use `registerXController` for API route registration.
- Use `XService` for API application services.
- Use `XRepository` for persistence adapters and contracts.
- Use descriptive workflow/runtime names for worker modules.

## Testing Standards

- Keep unit tests close to business or runtime contracts.
- Use integration tests to validate composition boundaries:
  API composition, repository adapters, and worker execution flows.
- Prefer tests that verify ownership boundaries and contracts over tests that snapshot incidental implementation details.

## Documentation Standards

- Document durable contracts, boundaries, and responsibilities.
- Do not document unstable local shortcuts as architecture.
- Prefer describing who owns a concern and what contract they expose.
- When implementation and docs diverge, update docs to match the durable current behavior.
