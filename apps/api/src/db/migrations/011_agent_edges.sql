create table if not exists agent_edges (
  id text primary key,
  dag_id text not null references agent_dags(id) on delete cascade,
  from_node_id text not null,
  to_node_id text not null,
  edge_type text not null
);

