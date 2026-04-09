create table if not exists node_executions (
  id text primary key,
  job_run_id text not null references job_runs(id) on delete cascade,
  node_id text not null,
  node_type text not null,
  status text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  latency_ms integer not null default 0,
  token_usage integer not null default 0,
  retry_count integer not null default 0,
  started_at timestamptz not null,
  completed_at timestamptz
);

