create table if not exists job_memories (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(job_id, key)
);

