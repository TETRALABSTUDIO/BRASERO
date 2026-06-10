-- Run this once in Supabase → SQL Editor → New query → Run.

create table if not exists orders (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz default now(),
  stripe_session_id  text unique,
  status             text default 'pending',   -- pending | paid | onboarding-only
  plan               text,
  billing            text,                      -- once | sub
  amount             integer,                   -- cents
  name               text,
  email              text,
  instagram          text,
  handle             text,
  answers            jsonb,                     -- onboarding answers
  onboarding_at      timestamptz
);

create index if not exists orders_email_idx on orders (email);
create index if not exists orders_created_idx on orders (created_at desc);

-- The backend uses the SERVICE ROLE key (server-side only), which bypasses RLS.
-- Keep Row Level Security ON so the table is never readable from the public anon key.
alter table orders enable row level security;
