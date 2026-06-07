# Jobs Domain

This document describes the implemented jobs domain in the repository.

The jobs domain is the control-plane aggregate for user-configured workflow intent.

It currently covers:

- job creation
- job ownership
- attached schedule records
- attached alert preference records
- job listing for the owning user
- downstream queueing of runs against a job

It does not currently include job editing, pausing, deletion, schedule reconciliation, or lifecycle management beyond creation and listing.

## Scope

The jobs domain spans:

- protected API job creation
- protected API job listing
- persistence of a job plus its initial schedule and alert preferences
- user-scoped ownership rules
- frontend create-job and jobs-list pages

The jobs domain depends on:

- the agents domain for validating `agentDefinitionKey`
- the auth domain for local user ownership
- the runs domain for execution attempts
- the alerts surface for reading job alert preferences across owned jobs

## Entities

### Job

The central jobs-domain entity is `Job`.

Fields:

- `id`
- `userId`
- `name`
- `dagId`
- `agentDefinitionKey`
- `status`
- `inputs`
- `createdAt`
- `updatedAt`

Current status values come from the shared job status contract:

- `active`
- `paused`
- `disabled`

In current implementation, newly created jobs are always created as `active`.

### Job Schedule

Each created job receives a schedule record.

Fields:

- `id`
- `jobId`
- `scheduleExpression`
- `timezone`
- `enabled`
- `createdAt`
- `updatedAt`

In current implementation, the initial schedule is always created with `enabled = true`.

### Job Alert Preference

Each created job also receives one or more alert preference records.

Fields:

- `id`
- `jobId`
- `channel`
- `destination`
- `onSuccess`
- `onFailure`

Alert preferences are modeled as job-owned records rather than embedded job fields.

### Job List Item

The `GET /jobs` response is effectively a composed read model.

Each listed item includes:

- the job
- its schedule, if found
- its alert preferences

This is a service-assembled view rather than a distinct stored entity.

## Ownership Boundaries

### Frontend

The frontend owns:

- agent selection for job creation
- collecting config-driven job inputs
- choosing the submitted job name
- submitting initial schedule and alert preference values
- listing owned jobs
- triggering run queueing from the jobs page

The frontend does not decide job ownership. It submits requests as the authenticated user.

### API Controller Layer

The API owns:

- requiring authenticated access for job APIs
- request-shape validation using shared schemas
- passing local user context into the jobs service

### Jobs Service

The jobs service owns:

- validating that the referenced agent exists
- constructing the job record
- creating the initial schedule record
- creating the initial alert preference records
- assembling user-scoped job list views

The jobs service does not currently own update or delete flows.

### Repositories

Persistence is split into:

- `JobRepository`
- `JobScheduleRepository`
- `AlertPreferenceRepository`

The jobs aggregate is therefore persisted across multiple repository contracts.

## Invariants

The implementation enforces or assumes the following invariants:

- job APIs require an authenticated local user
- every created job is owned by the authenticated local user
- client input does not provide `userId`
- a job must reference an existing `agentDefinitionKey`
- every created job also gets a schedule record
- every created job also gets alert preference records, even if the array is empty
- job listing is scoped to the authenticated user
- downstream run queueing only succeeds for jobs owned by the requesting user

## Business Rules

### Job Creation

- A job is created from a known agent definition.
- If the client provides `dagId`, it is used; otherwise the agent definition’s DAG ID is used.
- New jobs are always created with `status = "active"`.
- Schedule and alert preferences are treated as part of initial job setup.

### Ownership

- Jobs are user-owned through `userId`.
- Only the owning user sees their jobs in `GET /jobs`.
- Only the owning user can queue or execute a run for a job.

### Scheduling

- Schedule intent is persisted with each job at creation time.
- The repository stores the schedule, but no implemented scheduler reconciliation flow exists in the jobs domain itself.

### Alerts

- Alert preferences are stored per job.
- The jobs service writes alert preferences on creation.
- The alerts service later reads alert preferences across all jobs owned by the requesting user.

### Execution Triggering

- The jobs page exposes “Queue Run” for an owned job.
- Queueing a run is not part of job creation itself, but it is the primary downstream operation taken from the jobs UI.

## APIs

### `GET /jobs`

Purpose:

- list jobs owned by the authenticated user

Auth:

- protected

Response shape:

- `{ items }`

Each item includes:

- job fields
- `schedule`
- `alertPreferences`

### `POST /jobs`

Purpose:

- create a job for the authenticated user

Auth:

- protected

Request shape:

- `agentDefinitionKey`
- `dagId` optional
- `name`
- `scheduleExpression`
- `timezone`
- `inputs`
- `alertPreferences`

Response:

- `201`
- `{ item }`

## Execution Flows

### 1. Create Job Flow

1. The frontend loads available agent definitions.
2. The user selects an agent definition.
3. The frontend renders form fields from the selected agent’s UI schema.
4. The frontend builds `inputs` from form values.
5. The frontend submits `POST /jobs` with:
   - `agentDefinitionKey`
   - optional `dagId`
   - `name`
   - `scheduleExpression`
   - `timezone`
   - `inputs`
   - `alertPreferences`
6. The API validates the request body against the shared schema.
7. The jobs service validates that the agent exists.
8. The jobs service creates the job record.
9. The jobs service creates the schedule record.
10. The jobs service creates alert preference records.
11. The API returns the created job.

### 2. List Jobs Flow

1. The authenticated client calls `GET /jobs`.
2. The API resolves the local user from auth context.
3. The jobs service loads jobs owned by that user.
4. For each job, the service loads:
   - its schedule
   - its alert preferences
5. The API returns the assembled list.

### 3. Queue Run From Job Flow

1. The user views owned jobs in the jobs page.
2. The user clicks `Queue Run` on a job.
3. The frontend calls `POST /runs` with the job ID.
4. The runs domain verifies that the job exists and belongs to the caller.
5. A queued run is created for that job.

This flow depends on the jobs domain because job ownership and persisted job identity are the prerequisite for queueing work.

### 4. Alerts Read Flow

1. The authenticated client requests alerts through the alerts surface.
2. The alerts service lists all jobs owned by the user.
3. The alerts service loads alert preferences for each job.
4. The combined alert preferences are returned.

This is a read path over job-owned alert configuration.

## Failure Modes

### Authorization Failures

- missing auth
- invalid token
- disabled user

Observed result:

- the same auth failures as other protected APIs

### Agent Validation Failures

- unknown `agentDefinitionKey` at job creation

Observed result:

- `404 agent_not_found`

### Ownership Failures

- run queueing or execution references a job owned by another user
- run queueing or execution references a missing job

Observed result:

- `404 job_not_found`

The implementation intentionally hides ownership mismatches behind the same `job_not_found` response.

### Data Persistence Failures

- any repository insert for the job, schedule, or alert preferences fails

Observed result:

- the request fails
- partial aggregate persistence is possible because the jobs service does not wrap job, schedule, and alert creation in a single explicit transaction

### Read-Model Gaps

- a listed job has no schedule record
- a listed job has no alert preference records

Observed result:

- `schedule` can be `null`
- `alertPreferences` can be an empty array

The jobs page currently shows “No schedule found” when schedule data is absent.

## Inconsistencies and Drift

### Job Aggregate Persistence Is Multi-Step Without Explicit Transactional Boundary

The jobs service creates:

- the job
- then the schedule
- then the alert preferences

There is no explicit service-level transaction covering the aggregate creation flow.

That means the domain concept is a single control-plane aggregate, but the current implementation persists it in separate steps.

### Database Schema Contains Both `input` and `inputs`

The jobs table schema currently defines both:

- `input`
- `inputs`

The repository writes both fields with the same value, while the shared domain model only exposes `inputs`.

This is clear schema drift within the jobs domain.

### Frontend Job List Typing Does Not Fully Mirror API Output

The frontend job-list API type only models `schedule` explicitly.

The API service actually returns both:

- `schedule`
- `alertPreferences`

The jobs page currently uses only schedule information and ignores alert preferences.

### Schedule Is Required at Creation but Not Guaranteed at Read Time

The shared create-job schema requires:

- `scheduleExpression`
- `timezone`

But the jobs list model allows `schedule` to be `null` and the UI handles missing schedules.

So the write path assumes a schedule is always created, while the read path is defensive about it not existing.

### Alert Preferences Are Job-Owned but Not Visible in the Jobs UI

Alert preferences are created and returned by the jobs service, and they are used by the alerts read flow.

However, the jobs page does not display them.

### Job Status Contract Is Broader Than Current Jobs Behavior

The shared `JobStatus` contract supports:

- `active`
- `paused`
- `disabled`

In the implemented jobs domain:

- new jobs are always `active`
- there are no APIs to pause or disable jobs

The wider status vocabulary exists, but current jobs behavior uses only part of it.
