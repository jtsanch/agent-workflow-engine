create table if not exists job_runs (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  status text not null,
  trigger_source text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  output jsonb,
  error_message text
);

