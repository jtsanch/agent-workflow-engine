create table if not exists job_dag_versions (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  dag_id text not null,
  dag_version text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

