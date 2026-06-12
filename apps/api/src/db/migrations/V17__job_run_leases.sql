alter table job_runs
  add column if not exists queued_at timestamptz,
  add column if not exists claimed_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists claimed_by_worker_id text;

update job_runs
set queued_at = coalesce(queued_at, started_at, created_at)
where queued_at is null;

alter table job_runs
  alter column queued_at set not null;

create index if not exists job_runs_queued_poll_idx
  on job_runs (queued_at asc)
  where status = 'queued';

create index if not exists job_runs_running_lease_idx
  on job_runs (lease_expires_at asc)
  where status = 'running';
