create table if not exists agent_dags (
  id text primary key,
  agent_definition_key text not null,
  version text not null,
  name text not null,
  definition jsonb not null,
  created_at timestamptz not null default now()
);

