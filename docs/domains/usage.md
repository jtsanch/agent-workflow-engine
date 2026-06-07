# Usage Domain

This document describes the implemented usage domain in the repository.

The usage domain tracks per-user LLM consumption limits, counters, and event history.

It currently covers:

- creation of default usage state for newly bootstrapped users
- read APIs for current usage summary and user-scoped usage events
- admin-facing read access to per-user usage summaries
- worker-owned quota checks before run execution
- worker-owned persistence of usage events and counter increments after execution

The usage domain is both a control-plane read surface and an execution-time policy surface.

## Scope

The usage domain spans:

- persisted usage limits
- persisted usage counters
- persisted append-only usage events
- authenticated user access to current usage summary and event history
- admin read access to other users’ summaries
- worker enforcement of daily and monthly token limits

The usage domain depends on:

- the auth domain for user identity and approval-gated access
- the worker domain for quota enforcement and usage-event creation
- the runs domain for linking usage events to jobs and runs
- the user bootstrap flow for initial creation of usage state

## Entities

### Usage Limits

Per-user usage limits are stored in `user_llm_usage_limits`.

Relevant fields are:

- `userId`
- `dailyTokenLimit`
- `monthlyTokenLimit`
- `perRunTokenLimit`
- `createdAt`
- `updatedAt`

This is the configurable limit record for one user.

### Usage Counters

Per-user accumulated usage is stored in `user_usage_counters`.

Relevant fields are:

- `userId`
- `dailyTokens`
- `monthlyTokens`
- `lastDailyReset`
- `lastMonthlyReset`

This is the mutable state the worker reads and updates during execution.

### Usage Summary

The main read model returned by the API is a summary composed from limits and counters.

Relevant fields are:

- `dailyUsed`
- `dailyLimit`
- `monthlyUsed`
- `monthlyLimit`
- `perRunLimit`

This is the usage shape returned by `/usage/me`, `/auth/me`, and the admin user list.

### Usage Event

Usage events are append-only records of model consumption.

Relevant fields are:

- `id`
- `userId`
- `jobId`
- `jobRunId`
- `model`
- `promptTokens`
- `completionTokens`
- `totalTokens`
- `createdAt`

These are the historical usage records exposed through `/usage/me/events`.

## Ownership Boundaries

### User Bootstrap

The user bootstrap flow owns first-time creation of usage state.

For a newly created user it creates:

- a usage-limits record
- a usage-counters record

This happens in the same database transaction as local user creation.

### Usage Repository And Service

The API-side usage service owns:

- loading the current usage summary
- listing usage events for one user
- mapping repository records into API response shapes

It does not enforce limits.

### Usage API

The usage controller owns the authenticated public API for:

- current-user summary
- current-user usage-event history

The auth controller also depends on usage reads to include usage summary in `/auth/me`.

### Admin Surface

The admin user-management surface consumes usage summaries for every listed user.

It is a usage consumer, not an owner of usage policy.

### Worker Runtime

The worker owns execution-time usage policy.

That ownership includes:

- loading usage state before execution
- lazily resetting counters when day or month boundaries change
- failing runs when daily or monthly quota is exceeded
- writing usage events after execution
- incrementing usage counters transactionally with usage-event insertion

The worker is the only place where usage limits are actively enforced.

## Invariants

The implementation enforces or assumes the following invariants:

- usage state is per user
- a valid usage summary requires both a usage-limits record and a usage-counters record
- usage events are user-scoped and ordered by creation time and id
- usage counters represent accumulated token totals, not request counts
- daily and monthly counters reset based on UTC day and UTC month boundaries
- quota checks happen before workflow execution begins
- usage events are written only after execution produces usage telemetry
- counter increments are based on the sum of persisted usage events for that run

The implementation also assumes that any authenticated and approved Postgres-backed user already has usage state.

## Business Rules

### Usage State Creation

- A first-time local user bootstrap creates default limits and zeroed counters.
- The first user receives the same default usage values as later users.
- Existing users are not re-seeded by the bootstrap path.

The default seeded values are:

- daily token limit: `60000`
- monthly token limit: `300000`
- per-run token limit: `12000`

### Summary Reads

- `GET /usage/me` returns the current user’s usage summary.
- `/auth/me` also returns the same summary alongside the authenticated user record.
- Admin user listing includes a usage summary for each returned user.

### Event History Reads

- `GET /usage/me/events` returns only the authenticated user’s events.
- Events are sorted newest first.
- Pagination is cursor-based by event id, using creation time plus id ordering.
- If a cursor does not resolve for that user, the repository returns an empty page.

### Quota Enforcement

- The worker loads usage state after claiming a queued run.
- It resets daily and monthly counters if the UTC day or month has changed.
- It fails the run before execution if daily or monthly usage is already at or above the limit.
- Successful execution inserts usage events and increments the counters by total tokens used.

### Usage Attribution

- Usage events can be linked to a job and a run.
- Token accounting is driven by execution telemetry emitted from LLM and evaluator nodes.
- Tool-only execution without usage telemetry does not create usage events.

## APIs

The public usage API is authenticated.

### `GET /usage/me`

Returns:

- the current user’s usage summary

Behavior:

- requires authenticated, approved access
- returns daily, monthly, and per-run limits alongside current daily and monthly usage

### `GET /usage/me/events`

Query:

- `cursor?: string`
- `limit?: number`

Returns:

- `{ events: UsageEventListItem[]; nextCursor?: string }`

Behavior:

- returns only the authenticated user’s usage events
- supports cursor pagination
- orders events descending by `createdAt` and `id`

### Secondary Consumers

The usage domain is also exposed indirectly through:

- `GET /auth/me`, which includes `usage`
- `GET /admin/users`, which includes per-user usage summaries for admins

These are usage reads embedded inside other domains’ APIs.

## Execution Flows

### User Bootstrap Flow

1. A new Clerk-authenticated user is bootstrapped into the local user store.
2. The bootstrap transaction inserts the user record.
3. The same transaction inserts default usage limits.
4. The same transaction inserts zeroed usage counters.
5. Future usage reads can now resolve a complete summary for that user.

### Authenticated Usage Summary Flow

1. The client authenticates through Clerk.
2. The backend resolves the local user through auth middleware.
3. The usage service loads the summary from counters joined to limits.
4. The summary is returned either directly from `/usage/me` or embedded in `/auth/me`.

### Usage Event Listing Flow

1. The authenticated client calls `/usage/me/events`.
2. The usage service loads the user-scoped page from the repository.
3. If a cursor is provided, the repository resolves the cursor row for that same user.
4. The repository returns events in descending chronological order with an optional next cursor.

### Worker Enforcement And Write Flow

1. The worker claims a queued run.
2. It loads the user’s usage state from counters and limits.
3. It resets daily or monthly counters if the UTC reset window has rolled over.
4. It fails the run immediately if the user is already over daily or monthly quota.
5. If execution proceeds, node-level runtime collects usage telemetry.
6. After execution, the worker inserts usage events and increments counters in one transaction.
7. The run is finalized in that same completion transaction.

## Failure Modes

### Missing Usage State

- If summary reads cannot find usage state, the API returns `500 usage_state_not_found`.
- The same failure affects `/usage/me`, `/usage/me/events` setup checks, `/auth/me`, and admin user listing.
- In practice this represents broken bootstrap or missing Postgres-backed usage wiring.

### Read Pagination Edge Cases

- If a supplied cursor does not belong to the current user or does not exist, event listing returns an empty page rather than a dedicated error.

### Execution-Time Failures

- If the worker cannot load usage state, execution fails with an internal worker error.
- If daily or monthly quota is exceeded, the worker marks the run failed before DAG execution starts.
- If the completion transaction fails after execution, usage-event insertion and counter updates may be lost even though execution already occurred.

### Configuration Gaps

- In non-Postgres application mode, usage services are not wired, so usage APIs are unavailable.
- Surfaces that depend on usage reads can therefore fail even when unrelated domain data exists.

## Inconsistencies And Drift

The current implementation contains the following notable inconsistencies:

- `perRunLimit` is stored, returned by APIs, and displayed in the web app, but the worker does not currently enforce a per-run token limit.
- The usage domain is effectively Postgres-only. In-memory app mode wires no usage service, even though other domains support in-memory repositories.
- Missing usage service wiring often surfaces as `usage_state_not_found`, which is a misleading error for a configuration problem.
- `/usage/me/events` checks only that the usage service is configured, not that summary state exists, so missing usage state can fail later and differently than `/usage/me`.
- Admin user listing depends on per-user usage summaries, which means a single user with broken usage state can fail the broader admin listing flow.
- Daily and monthly resets are lazy and execution-triggered, not background-maintained. Read APIs therefore reflect stored counters until a worker path performs a reset.
