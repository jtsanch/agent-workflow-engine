create table if not exists tool_invocations (
  id text primary key,
  node_execution_id text not null,
  tool_name text not null,
  request jsonb not null default '{}'::jsonb,
  response jsonb,
  status text not null,
  created_at timestamptz not null default now()
);
