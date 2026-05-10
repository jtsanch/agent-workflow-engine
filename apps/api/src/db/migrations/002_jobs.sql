create table if not exists jobs (
  id text primary key,
  user_id uuid not null references users(id),
  agent_definition_key text,
  dag_id text,
  name text not null,
  status text not null,
  input jsonb not null default '{}'::jsonb,
  inputs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
