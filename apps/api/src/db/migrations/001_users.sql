create table if not exists users (
  id uuid primary key,
  email text not null unique,
  first_name text,
  last_name text,
  clerk_user_id text not null unique,
  status text not null,
  role text not null,
  created_at timestamp not null,
  updated_at timestamp not null,
  last_login_at timestamp
);
