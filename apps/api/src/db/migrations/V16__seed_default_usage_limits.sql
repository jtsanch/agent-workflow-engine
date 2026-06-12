insert into user_llm_usage_limits (
  user_id,
  daily_token_limit,
  monthly_token_limit,
  per_run_token_limit,
  created_at,
  updated_at
)
select
  users.id,
  60000,
  300000,
  12000,
  now(),
  now()
from users
on conflict (user_id) do nothing;
