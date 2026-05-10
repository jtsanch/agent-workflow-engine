create table if not exists agent_nodes (
  id text primary key,
  dag_id text not null references agent_dags(id) on delete cascade,
  node_type text not null,
  agent_key text not null,
  name text not null,
  input_mapping jsonb not null default '{}'::jsonb,
  output_schema jsonb not null default '{}'::jsonb,
  retry_policy jsonb
);

