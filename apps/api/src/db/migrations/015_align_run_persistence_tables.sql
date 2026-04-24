create table if not exists job_runs (
  id text primary key,
  job_id text not null,
  status text not null check (status in ('queued','running','succeeded','failed')),
  trigger_source text not null default 'manual',
  started_at timestamptz,
  completed_at timestamptz,
  output jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

alter table job_runs
  add column if not exists created_at timestamptz not null default now();

alter table job_runs
  alter column trigger_source set default 'manual';

alter table job_runs
  alter column started_at drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'job_runs_status_check'
      and conrelid = 'job_runs'::regclass
  ) then
    alter table job_runs
      add constraint job_runs_status_check
      check (status in ('queued','running','succeeded','failed')) not valid;
  end if;
end
$$;

create table if not exists node_executions (
  id text primary key,
  job_run_id text not null,
  node_id text not null,
  node_type text not null,
  node_version text not null,
  status text not null,
  resolved_input jsonb not null,
  output jsonb,
  error_message text,
  latency_ms integer,
  token_usage integer,
  cost_usd numeric,
  retry_count integer not null default 0,
  started_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table node_executions
  add column if not exists node_version text;

update node_executions
set node_version = coalesce(node_version, 'v1')
where node_version is null;

alter table node_executions
  alter column node_version set not null;

alter table node_executions
  add column if not exists resolved_input jsonb;

update node_executions
set resolved_input = coalesce(resolved_input, input, '{}'::jsonb)
where resolved_input is null;

alter table node_executions
  alter column resolved_input set not null;

alter table node_executions
  add column if not exists error_message text;

alter table node_executions
  add column if not exists cost_usd numeric;

alter table node_executions
  add column if not exists created_at timestamptz not null default now();

alter table node_executions
  alter column latency_ms drop not null;

alter table node_executions
  alter column token_usage drop not null;

create table if not exists tool_invocations (
  id text primary key,
  node_execution_id text not null,
  tool_name text not null,
  request jsonb not null,
  response jsonb,
  status text not null,
  created_at timestamptz not null default now()
);

alter table tool_invocations
  add column if not exists node_execution_id text;

update tool_invocations
set node_execution_id = coalesce(node_execution_id, job_run_step_id, '')
where node_execution_id is null;

alter table tool_invocations
  alter column node_execution_id set not null;

create table if not exists node_feedback (
  id text primary key,
  job_run_id text not null,
  source_node_id text not null,
  target_node_id text not null,
  score numeric,
  passed boolean,
  issues jsonb,
  summary text,
  should_retry boolean,
  created_at timestamptz not null default now()
);

alter table node_feedback
  add column if not exists job_run_id text;

update node_feedback
set job_run_id = coalesce(job_run_id, '')
where job_run_id is null;

alter table node_feedback
  alter column job_run_id set not null;

alter table node_feedback
  add column if not exists passed boolean;

alter table node_feedback
  add column if not exists issues jsonb;

update node_feedback
set target_node_id = ''
where target_node_id is null;

alter table node_feedback
  alter column target_node_id set not null;

create table if not exists job_memories (
  id text primary key,
  job_id text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null,
  unique (job_id, key)
);
