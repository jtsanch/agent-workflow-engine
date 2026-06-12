create table if not exists feedback_events (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  job_run_id text references job_runs(id) on delete set null,
  score integer not null,
  comment text,
  created_at timestamptz not null default now()
);

