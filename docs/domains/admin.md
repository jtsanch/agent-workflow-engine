# Admin Domain

This document describes the implemented admin domain in the repository.

The current admin domain is narrow. It is focused on platform user management, specifically:

- listing local platform users
- viewing each user’s usage summary
- enabling users
- disabling users

It does not currently include broader administrative policy management, role editing, quota editing, or audit workflows.

## Scope

The admin domain spans:

- admin-only API access checks
- admin-only user listing
- admin-only user status changes
- admin UI exposure for the user management page

The admin domain depends on the auth domain for identity and role resolution, and on the usage domain for per-user usage summaries shown in admin views.

## Entities

### Admin User

There is no separate admin entity or table.

An admin is a local platform user whose:

- `role = "admin"`

Admin capability is derived from the local user role in request auth context.

### Managed User

The subject of admin actions is the local platform user record.

Relevant fields used by the admin domain:

- `id`
- `email`
- `firstName`
- `lastName`
- `status`
- `role`

Current statuses:

- `active`
- `disabled`

Current roles:

- `admin`
- `user`

### Admin User List Item

The admin list response is a composed read model, not a stored entity.

It combines:

- local user identity fields
- local user status
- local user role
- usage summary

### Usage Summary

Usage summary is not owned by the admin domain, but it is part of the admin-facing user list.

Fields shown:

- `dailyUsed`
- `dailyLimit`
- `monthlyUsed`
- `monthlyLimit`
- `perRunLimit`

## Ownership Boundaries

### Frontend

The frontend owns:

- showing the admin navigation link only when the authenticated user role is `admin`
- rendering the user management page
- calling admin APIs
- optimistic local status updates after enable and disable actions

The frontend does not enforce admin security. It only reflects the authenticated user’s role in the UI.

### API Access Control

The API owns actual admin authorization.

It is responsible for:

- requiring an authenticated request
- requiring `role === "admin"`
- rejecting non-admin callers with `403 forbidden`

### Admin Service Layer

The service layer owns:

- listing users
- attaching usage summaries to each returned user
- validating that a target user exists before changing status
- applying the status change

The service layer does not own:

- role assignment
- usage editing
- user deletion

## Invariants

The implementation enforces or assumes the following invariants:

- admin APIs require an authenticated request
- admin APIs require a local auth context with `role === "admin"`
- enable and disable actions target local platform users, not Clerk identities
- a target user must exist before status is updated
- admin list results include usage summaries for each returned user
- admin actions change user `status` only
- admin actions do not change `role`

## Business Rules

### Admin Eligibility

- A user is treated as an admin only if their local platform role is `admin`.
- Admin access is local-platform role-based, not Clerk-provider-role-based.

### User Listing

- Admins can request a paginated list of users.
- Each listed user includes usage summary data.
- The admin domain lists all local users, regardless of status.

### User Enable

- Enable changes the target user status to `active`.
- Once enabled, future protected requests from that user can succeed, assuming other auth checks pass.

### User Disable

- Disable changes the target user status to `disabled`.
- Once disabled, future protected requests from that user are rejected by the auth domain.

### Role Management

- Role management is not part of the current admin domain.
- Admins cannot promote or demote users through the implemented API.

## APIs

### `GET /admin/users`

Purpose:

- list local platform users with usage summaries

Auth:

- protected
- admin-only

Query parameters:

- `cursor` optional
- `limit` optional positive integer

Response shape:

- `users`
- `nextCursor`

### `POST /admin/users/:id/enable`

Purpose:

- set the target local user status to `active`

Auth:

- protected
- admin-only

Response:

- `204 No Content`

### `POST /admin/users/:id/disable`

Purpose:

- set the target local user status to `disabled`

Auth:

- protected
- admin-only

Response:

- `204 No Content`

## Execution Flows

### 1. Admin Page Access Flow

1. The authenticated app shell resolves the current user through `/auth/me`.
2. If the current user role is `admin`, the frontend renders the `Users` navigation link and route.
3. The admin page loads `/admin/users`.
4. The API checks authentication and admin role.
5. The service returns user records with usage summaries.
6. The frontend renders user cards and status actions.

### 2. User List Flow

1. An admin calls `GET /admin/users`.
2. The API validates query parameters.
3. The service loads all local users from the user repository.
4. The service applies cursor and limit slicing in memory.
5. The service fetches usage summary for each returned user.
6. The API returns a paginated response with `users` and optional `nextCursor`.

### 3. Enable User Flow

1. An admin clicks enable in the admin UI.
2. The frontend calls `POST /admin/users/:id/enable`.
3. The API checks authentication and admin role.
4. The service verifies that the target user exists.
5. The service updates the target user status to `active`.
6. The frontend updates the local card state to show `active`.

### 4. Disable User Flow

1. An admin clicks disable in the admin UI.
2. The frontend calls `POST /admin/users/:id/disable`.
3. The API checks authentication and admin role.
4. The service verifies that the target user exists.
5. The service updates the target user status to `disabled`.
6. The frontend updates the local card state to show `disabled`.

## Failure Modes

### Authorization Failures

- missing bearer token
- malformed bearer header
- invalid token
- authenticated non-admin calling admin APIs
- disabled user attempting admin access

Observed result:

- `401 unauthorized` for missing or invalid authentication
- `403 forbidden` for authenticated callers without admin access

### Configuration Failures

- admin controller registered without a working admin service
- missing auth context service upstream

Observed result:

- `500` responses from the API

### Data-State Failures

- target user does not exist during enable or disable
- usage summary is missing for a listed user

Observed result:

- `404 user_not_found`
- `500 usage_state_not_found`

### Frontend Request Failures

- admin API request fails after the page is shown
- enable or disable request fails

Observed result:

- the page keeps local loading or pending button state only for the active request
- the page does not expose domain-specific recovery behavior beyond the thrown API error

## Inconsistencies and Drift

### Admin Domain Is Really “Admin User Management”

The implemented admin surface is limited to user listing and status toggling.

The term “admin domain” suggests a broader responsibility than what currently exists.

### UI Gating and API Gating Are Separate

The frontend hides the admin page for non-admins, but that is only presentation logic.

Real enforcement happens in the API through `requireAdminRole`.

This is correct behavior, but it means frontend visibility should not be mistaken for security.

### Pagination Is In-Memory, Not Repository-Level

`listUsers` loads all users, then applies cursor and limit slicing in memory.

This means the admin pagination contract is implemented at the service layer rather than the persistence layer.

### Invalid Cursor Behavior Is Lenient

If a cursor does not match a user ID, the current slicing logic falls back to the first page rather than returning an error or an empty page.

This is current behavior, not an explicit documented business rule elsewhere.

### Missing Admin Service Returns a Usage-Oriented Error

When the admin controller is missing its service dependency, it returns `usage_state_not_found`.

That error code reflects the shared usage dependency more than the actual failure cause.

### No Special Safeguards Around Admin Status Changes

The current implementation does not prevent:

- disabling yourself
- disabling another admin
- disabling the last admin
- re-enabling any existing local user

These are all allowed by the implemented service as long as the target user exists.

### No Role Management

The admin domain exposes user status changes, but not user role changes.

That makes status mutable through admin APIs, while role remains fixed outside this domain.
