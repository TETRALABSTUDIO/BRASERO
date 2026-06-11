-- Run in Supabase → SQL Editor after supabase_schema.sql.
-- Adds the order tracking ref + the per-deck production/validation workflow.

-- Short human-facing order number (last 8 of the Stripe session id, uppercased).
alter table orders add column if not exists ref text;
create index if not exists orders_ref_idx on orders (ref);

-- One row per deck the studio produces for an order.
create table if not exists decks (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid references orders(id) on delete cascade,
  position             integer default 0,            -- display order
  title                text,
  status               text default 'writing',
  -- writing | script_review | designing | design_review | revision | done
  script               text,                         -- the post script/copy
  script_validated_at  timestamptz,
  design_url           text,                         -- legacy single design (kept for compat)
  design_urls          jsonb default '[]'::jsonb,    -- up to 10 design images
  design_validated_at  timestamptz,
  revision_note        text,                         -- customer's last retouch request
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

create index if not exists decks_order_idx on decks (order_id, position);

-- If the table already existed from an earlier run, add the column:
alter table decks add column if not exists design_urls jsonb default '[]'::jsonb;

alter table decks enable row level security;
-- The backend uses the SERVICE ROLE key (bypasses RLS); keep RLS on so the
-- public anon key can never read decks directly.
