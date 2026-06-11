-- Run in Supabase → SQL Editor after supabase_decks.sql.
-- Talent (freelancer) accounts + per-project assignment.

create table if not exists talents (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz default now(),
  email          text unique not null,
  password_hash  text not null,         -- scrypt "salt:hash" (set by the backend)
  name           text,
  photo          text,                  -- profile photo (data URL or hosted URL)
  is_owner       boolean default false  -- owner can manage talents + assign projects
);

alter table talents add column if not exists photo text;

create index if not exists talents_email_idx on talents (lower(email));

-- Assign an order to a Talent (by email). Null = unassigned.
alter table orders add column if not exists talent_email text;
create index if not exists orders_talent_idx on orders (talent_email);

alter table talents enable row level security;
-- Backend uses the SERVICE ROLE key (bypasses RLS); keep RLS on so password
-- hashes can never be read from the public anon key.

-- Bootstrap your owner account: pick an email, then set the password from the
-- panel's first login is not possible — instead create it once via the API
-- (POST /api/auth { action:'bootstrap', email, password, name } with the
-- x-admin-token header = ADMIN_TOKEN). See README/notes.
