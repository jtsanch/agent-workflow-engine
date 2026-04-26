create table if not exists job_runs (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  status text not null check (status in ('queued','running','succeeded','failed')),
  trigger_source text not null default 'manual',
  started_at timestamptz,
  completed_at timestamptz,
  output jsonb,
  error_message text,
  created_at timestamptz not null default now()
);
