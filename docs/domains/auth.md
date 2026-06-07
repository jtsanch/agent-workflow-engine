# Auth Domain

This document describes the implemented authentication and access-control domain in the repository.

It covers:

- identity resolution through Clerk
- local platform user ownership
- approval and admin gating
- usage-state coupling that is created during user bootstrap

This is a documentation of current behavior, including known inconsistencies.

## Scope

The auth domain spans:

- frontend session bootstrap and gated UI states
- API token verification and request auth context creation
- local user creation and lookup
- admin-only user enable and disable actions
- authenticated access to usage summaries that are created with users

The auth domain does not implement custom credential storage or a provider abstraction. Clerk is the only identity provider in use.

## Entities

### Clerk Identity

External identity resolved by the API from a bearer token.

Fields used by the application:

- `clerkUserId`
- `email`
- `firstName`
- `lastName`

This identity is not the platform ownership record. It is the upstream identity source.

### Local User

Platform-owned user record stored in the `users` table.

Fields:

- `id`
- `email`
- `firstName`
- `lastName`
- `clerkUserId`
- `status`
- `role`
- `createdAt`
- `updatedAt`
- `lastLoginAt`

Current statuses:

- `active`
- `disabled`

Current roles:

- `admin`
- `user`

### Auth Context

Per-request API auth context attached after token verification and local user resolution.

Fields:

- `clerkUserId`
- `localUserId`
- `role`
- `email`

This is the durable request-scoped representation used by protected API handlers.

### Usage State

Usage state is not identity, but it is tightly coupled to auth bootstrap.

Each bootstrapped local user also receives:

- a usage-limits record
- a usage-counters record

The auth domain depends on this because authenticated user and admin views read usage state immediately.

## Ownership Boundaries

### Frontend

The frontend owns:

- Clerk session presence
- loading, signed-out, ready, pending-approval, and error UI states
- fetching `/auth/me` after Clerk indicates a signed-in session

The frontend does not decide whether a user is allowed into the platform. It asks the API.

### API Middleware

The API auth middleware owns:

- bearer token extraction
- Clerk token verification
- Clerk user lookup
- creation of `request.clerkAuth`
- creation of `request.authContext`

This middleware is the entry point for all protected API access.

### Auth Services

The auth-related services own:

- local user lookup by Clerk identity
- first-login bootstrap behavior
- disabled-user rejection
- usage summary reads for authenticated user and admin screens

### Admin Surface

The admin auth surface owns:

- admin-only access to the user list
- admin-only enable and disable operations

It does not own role assignment. It only changes user status.

## Invariants

The implementation enforces or assumes the following invariants:

- every protected request must present a bearer token
- every accepted token must resolve to a Clerk user with an email address
- every protected request must resolve to a local platform user
- the first local user becomes `admin` and `active`
- later bootstrapped users become `user` and `disabled`
- disabled users cannot access protected APIs
- every bootstrapped local user receives usage limits and usage counters
- admin-only endpoints require `role === "admin"`
- local users are keyed to Clerk users by unique `clerkUserId`
- local user emails are unique

## Business Rules

### Sign-In and Access Approval

- Sign-in happens through Clerk.
- Platform access is decided by the API after Clerk authentication.
- A signed-in Clerk user who has no local user is bootstrapped on first protected request.
- The first bootstrapped local user is automatically approved as an admin.
- Every later bootstrapped user is created disabled and must be enabled by an admin.

### Protected Access

- Missing `Authorization` header returns `401 unauthorized`.
- Malformed bearer header returns `401 unauthorized`.
- Invalid token returns `401 unauthorized`.
- Missing or invalid local auth configuration returns `500 internal_error`.
- A disabled local user returns `403 forbidden`.

### Admin Authorization

- Admin access is role-based only.
- Admin endpoints require an authenticated request and `role === "admin"`.
- Enable and disable operations validate that the target user exists first.

### Usage Coupling

- Usage limits and counters are seeded when a local user is created.
- `/auth/me` includes both user data and usage summary.
- Admin user listings include usage summaries for each returned user.

## APIs

### `GET /auth/me`

Purpose:

- resolve the currently authenticated local user
- return current user identity and usage summary for the web app shell

Auth:

- protected

Response shape:

- `user`
- `usage`

### `GET /usage/me`

Purpose:

- return usage summary for the authenticated local user

Auth:

- protected

### `GET /usage/me/events`

Purpose:

- return paginated usage events for the authenticated local user

Auth:

- protected

### `GET /admin/users`

Purpose:

- list platform users with their usage summaries

Auth:

- protected
- admin-only

### `POST /admin/users/:id/enable`

Purpose:

- set a target user status to `active`

Auth:

- protected
- admin-only

### `POST /admin/users/:id/disable`

Purpose:

- set a target user status to `disabled`

Auth:

- protected
- admin-only

## Execution Flows

### 1. Frontend Bootstrap Flow

1. Clerk initializes in the browser.
2. If no Clerk session exists, the app stays in `signed_out`.
3. If a Clerk session exists, the frontend calls `GET /auth/me` with a bearer token.
4. If `/auth/me` succeeds, the app enters `ready`.
5. If `/auth/me` returns `403`, the app enters `pending_approval`.
6. Any other failure puts the app into `error`.

### 2. Protected API Request Flow

1. API middleware reads the `Authorization` header.
2. The token is verified with Clerk.
3. Clerk user details are fetched.
4. The API extracts Clerk identity fields.
5. The auth service resolves a local user by `clerkUserId`.
6. If no local user exists, bootstrap runs inside a database transaction.
7. If the resolved local user is disabled, the request is rejected with `403`.
8. Otherwise, `request.authContext` is attached and the route handler runs.

### 3. First User Bootstrap Flow

1. No local user exists for the Clerk identity.
2. The bootstrap service checks whether any local user exists at all.
3. Because none exists, a new local user is inserted with:
   - `role = admin`
   - `status = active`
4. Default usage limits are inserted.
5. Usage counters are inserted.
6. The request proceeds as an authenticated admin user.

### 4. Subsequent User Bootstrap Flow

1. No local user exists for the Clerk identity.
2. The bootstrap service finds at least one existing local user.
3. A new local user is inserted with:
   - `role = user`
   - `status = disabled`
4. Default usage limits are inserted.
5. Usage counters are inserted.
6. The same request is rejected with `403 forbidden`.
7. The frontend presents the pending-approval state.

### 5. Admin Approval Flow

1. An authenticated admin loads `/admin/users`.
2. The admin sees user records and usage summaries.
3. The admin calls enable or disable on a target user.
4. The target user status is updated in the local user record.
5. Future protected requests for that user are allowed or denied based on the new status.

## Failure Modes

### Authentication Failures

- missing authorization header
- malformed bearer token header
- token verification failure
- Clerk user lookup failure
- Clerk user with no email address

Observed result:

- `401 unauthorized`

### Configuration Failures

- auth middleware registered without a working auth service
- missing Clerk secret key
- missing user service or usage service for `/auth/me`
- missing usage service for usage or admin endpoints

Observed result:

- `500` errors from the API

### Access-Control Failures

- authenticated local user is disabled
- authenticated non-admin calls admin endpoints

Observed result:

- `403 forbidden`

### Data-State Failures

- authenticated local user ID no longer resolves in the user repository
- authenticated user has no usage state
- admin attempts to update a nonexistent user

Observed result:

- `500 authenticated_user_not_found`
- `500 usage_state_not_found`
- `404 user_not_found`

## Inconsistencies and Drift

### Pending Approval Is Inferred From Any `403` on Frontend Bootstrap

The frontend maps any `403` returned by `/auth/me` to `pending_approval`.

That matches disabled-user behavior, but it also means other `403` responses from `/auth/me` would be shown as approval pending even if the cause were different.

### `lastLoginAt` Is Seeded but Not Maintained

The local user bootstrap writes `lastLoginAt` when the user is first created, but normal authenticated requests do not update it afterward.

The field therefore behaves like an initial-login timestamp, not a reliable last-login record.

### Auth Depends on Postgres-Backed User Services

Protected routes depend on auth services that are only wired when the API is using the Postgres-backed user repositories.

In memory-backed mode, protected routes are not fully functional unless tests or custom context overrides provide auth services.

### Disabled and Pending Approval Are the Same Stored State

There is no separate stored status for “pending approval.”

The UI language says “Approval Pending,” but the actual persisted status is `disabled`.

### Admin Safeguards Are Minimal

Admin enable and disable operations only check:

- caller is an admin
- target user exists

There is no special-case protection against disabling the last admin, disabling self, or other operationally risky actions.

### Usage State Is Operationally Part of Auth

Usage data is modeled separately, but authenticated shell and admin views assume it exists.

That means user bootstrap is not just identity creation; it is also required state seeding for successful authenticated UI behavior.
