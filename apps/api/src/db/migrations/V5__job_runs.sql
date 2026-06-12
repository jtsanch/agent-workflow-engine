create table if not exists job_runs (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  executed_by_type text not null default 'user' check (executed_by_type in ('user','system')),
  status text not null check (status in ('queued','running','succeeded','failed')),
  trigger_source text not null default 'manual',
  started_at timestamptz,
  completed_at timestamptz,
  output jsonb,
  error_message text,
  created_at timestamptz not null default now()
);
