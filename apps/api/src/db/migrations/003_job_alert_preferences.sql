create table if not exists job_alert_preferences (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  channel text not null,
  destination text not null,
  on_success boolean not null default false,
  on_failure boolean not null default true
);

