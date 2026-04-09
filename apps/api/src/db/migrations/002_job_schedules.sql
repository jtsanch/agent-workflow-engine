create table if not exists job_schedules (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  schedule_expression text not null,
  timezone text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

