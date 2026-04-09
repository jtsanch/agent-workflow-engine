create table if not exists tool_invocations (
  id text primary key,
  job_run_step_id text not null references job_run_steps(id) on delete cascade,
  tool_name text not null,
  request jsonb not null default '{}'::jsonb,
  response jsonb,
  status text not null,
  created_at timestamptz not null default now()
);

