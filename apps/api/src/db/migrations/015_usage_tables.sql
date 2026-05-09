create table if not exists user_llm_usage_limits (
  user_id uuid primary key references users(id),
  daily_token_limit integer not null,
  monthly_token_limit integer not null,
  per_run_token_limit integer not null,
  created_at timestamp not null,
  updated_at timestamp not null
);

create table if not exists user_usage_counters (
  user_id uuid primary key references users(id),
  daily_tokens integer not null,
  monthly_tokens integer not null,
  last_daily_reset timestamp not null,
  last_monthly_reset timestamp not null
);

create table if not exists usage_events (
  id uuid primary key,
  user_id uuid not null references users(id),
  job_id text,
  job_run_id text,
  model text not null,
  prompt_tokens integer not null,
  completion_tokens integer not null,
  total_tokens integer not null,
  created_at timestamp not null
);
