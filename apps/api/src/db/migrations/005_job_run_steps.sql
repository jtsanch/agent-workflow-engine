create table if not exists job_run_steps (
  id text primary key,
  job_run_id text not null references job_runs(id) on delete cascade,
  name text not null,
  status text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  detail jsonb
);

