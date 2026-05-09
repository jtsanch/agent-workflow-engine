# Feature Overview

## Context

The agent workflow platform currently allows workflow execution without authenticated ownership, user attribution, or enforceable usage controls.

Operational problems:

- no authenticated access control
- no persistent user identity
- no ability to revoke access
- no job ownership enforcement
- no cost protection for LLM usage
- no admin visibility into user activity

Authentication itself is not a differentiating feature for this project.

This implementation intentionally uses Clerk for identity/session management so engineering effort stays focused on platform-specific behavior.

Primary goals:

- authenticate users via Clerk (Google OAuth provider)
- synchronize authenticated users into local platform users
- manually control access approval
- enforce per-user LLM usage limits
- tie jobs to authenticated users
- provide minimal admin controls and visibility

---

# Scope

Included:

Authentication:
- Clerk integration
- Google OAuth via Clerk
- frontend Clerk auth flow
- backend Clerk token/session validation
- authenticated request middleware
- logout
- `/auth/me`

User model:
- create local user on first authenticated access
- maintain local user status + role
- local ownership model independent of Clerk
- admin approval flow for new users
- bootstrap first-user admin creation

Usage controls:
- per-user daily token limits
- per-user monthly token limits
- usage counters
- append-only usage audit events
- lazy UTC resets
- worker-side quota enforcement
- per-run token limits

Job ownership:
- all jobs tied to local users
- ownership validation
- authenticated execution only

Admin:
- list users
- enable user
- disable user
- view usage summaries

Frontend:
- login/logout flow
- auth bootstrap
- pending approval state
- user display
- usage display
- admin user management

---

# Non-Goals

Authentication:
- custom OAuth implementation
- custom session storage
- refresh token handling
- JWT implementation
- multi-provider identity support beyond Clerk config
- auth provider abstraction
- invitation workflows

Usage:
- billing
- payments
- plan tiers
- per-model usage budgets
- global token budget
- admin quota overrides

User management:
- deleting users
- self-service profile editing
- org/team support

Jobs:
- shared DAG ownership
- collaborative access control
- public DAG definitions

Infra:
- Redis caching
- auth observability dashboards
- background cleanup jobs

---

# Core Workflows

## User Login

1. User clicks sign in
2. Clerk handles OAuth flow
3. User authenticates via Google
4. Frontend receives authenticated Clerk session
5. API validates Clerk auth token
6. Resolve local user via Clerk identity

If user exists:
- load user

If user does not exist:
- determine if this is first platform user

If first platform user:
- create user
- role = admin
- status = active

Otherwise:
- create user
- role = user
- status = disabled

Then:
- create usage limits
- create usage counters

7. Reject if local user disabled
8. Continue authenticated flow

---

## Authenticated Request

1. Frontend sends authenticated Clerk token
2. API validates Clerk auth
3. Extract Clerk user identifier
4. Lookup local user
5. Reject if missing
6. Reject if disabled
7. Attach auth context

---

## Job Creation

1. Authenticated user creates job
2. API derives local user
3. Persist job with local `user_id`

Rules:
- no anonymous creation
- no client-provided user_id

---

## Job Execution

1. Authenticated user requests execution
2. API validates ownership
3. Worker loads usage limits
4. Apply lazy reset if needed
5. Check daily limit
6. Check monthly limit
7. Check per-run limit
8. Reject if exceeded
9. Execute workflow
10. Capture usage
11. Insert usage_event
12. Increment counters

---

## Admin User Approval

1. Admin loads user list
2. View:
    - users
    - usage
    - role
    - status
3. Admin enables user
4. User gains access immediately

---

## Logout

1. Clerk logout
2. Frontend auth cleared
3. Future requests fail auth

---

# Data Model

## users

Purpose:
platform-local user model

Fields:
- id
- clerk_user_id
- email
- first_name
- last_name
- status (`active | disabled`)
- role (`admin | user`)
- created_at
- updated_at
- last_login_at

Constraints:
- clerk_user_id unique
- email unique

Invariants:
- every authenticated request resolves to exactly one local user
- first local user must be active admin
- all later users default to disabled user
- disabled users cannot access protected APIs

---

## user_llm_usage_limits

Purpose:
static usage quotas

Fields:
- user_id
- daily_token_limit
- monthly_token_limit
- per_run_token_limit
- created_at
- updated_at

Constants:
- DAILY_TOKEN_LIMIT = 60000
- MONTHLY_TOKEN_LIMIT = 300000
- PER_RUN_TOKEN_LIMIT = 12000

Invariant:
must exist for every user

---

## user_usage_counters

Purpose:
fast quota enforcement

Fields:
- user_id
- daily_tokens
- monthly_tokens
- last_daily_reset
- last_monthly_reset

Invariant:
must exist for every user

---

## usage_events

Purpose:
append-only audit log

Fields:
- id
- user_id
- job_id
- job_run_id
- model
- prompt_tokens
- completion_tokens
- total_tokens
- created_at

Invariant:
never updated after insert

---

## Updated Existing Tables

jobs:
- add user_id

job_execution:
- add user_id
- add executed_by_type (`user | system`)

---

# API Contract

## Auth

### GET /auth/me

Purpose:
resolve authenticated user context

Response: 200

ts
{
user: {
id: string;
email: string;
firstName: string | null;
lastName: string | null;
status: "active" | "disabled";
role: "admin" | "user";
};
usage: {
dailyUsed: number;
dailyLimit: number;
monthlyUsed: number;
monthlyLimit: number;
perRunLimit: number;
};
}

Failures:
- 401 unauthenticated
- 403 disabled user

---

## Usage

### GET /usage/me

Response: 200

same shape as usage object above

---

### GET /usage/me/events

Query:
- cursor
- limit

Response: 200

ts
{
events: [
{
id: string;
jobId?: string;
jobRunId?: string;
model: string;
promptTokens: number;
completionTokens: number;
totalTokens: number;
createdAt: string;
}
];
nextCursor?: string;
}

---

## Admin

### GET /admin/users

Response: 200

paginated list:
- user
- usage summary
- status
- role

---

### POST /admin/users/:id/enable

Response:
204

---

### POST /admin/users/:id/disable

Response:
204

---

# UX Expectations

Auth:
- Clerk hosted login
- login/logout controls
- auth bootstrap via `/auth/me`

Pending Approval:
- disabled authenticated users see:
  "Your account is pending approval."

Loading:
- auth bootstrap loading
- usage loading
- admin loading

Errors:
- unauthenticated → login prompt
- disabled → approval pending screen
- quota exceeded → clear actionable message

Success:
- seamless login
- immediate admin approval effect
- accurate usage visibility

---

# Technical Constraints

Auth:
- Clerk is source of truth for authentication
- API validates Clerk auth every protected request
- local user is source of truth for authorization

Architecture:
- API handles auth validation + ownership
- worker handles execution only
- worker must not validate auth

Persistence:
- PostgreSQL local domain data
- no local session storage
- no Redis

Validation:
- Fastify route validation
- Zod request/response schemas

Frontend:
- Clerk SDK auth state
- `/auth/me` for local bootstrap
- lightweight React state only

---

# Tradeoffs

Intentional simplifications:

Auth:
- outsourced to Clerk
- vendor dependency accepted
- approval gating handled locally

Usage:
- best-effort quota enforcement
- minor concurrent overages acceptable
- no global budget enforcement

Infra:
- DB lookup per request
- no cache
- minimal operational complexity

Rationale:

Authentication is commodity infrastructure for this MVP.

Platform ownership, usage enforcement, and workflow execution are the product-specific engineering worth building.
