create table if not exists node_feedback (
  id text primary key,
  node_execution_id text not null references node_executions(id) on delete cascade,
  source_node_id text not null,
  target_node_id text,
  score numeric not null,
  should_retry boolean not null default false,
  summary text not null,
  created_at timestamptz not null default now()
);

