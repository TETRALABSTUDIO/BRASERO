-- =====================================================================
-- Brasero — full database setup. Run ONCE in Supabase → SQL Editor.
-- Safe to re-run (everything uses IF NOT EXISTS).
-- =====================================================================

-- ---------- orders ----------

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

-- ---------- decks ----------

-- Short human-facing order number (last 8 of the Stripe session id, uppercased).
alter table orders add column if not exists ref text;
create index if not exists orders_ref_idx on orders (ref);

-- Extra fields a manually-created project can carry, just like a real checkout order.
alter table orders add column if not exists phone  text;
alter table orders add column if not exists addons jsonb default '[]'::jsonb;   -- selected upsell keys

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

-- If the table already existed from an earlier run, add the columns:
alter table decks add column if not exists design_urls jsonb default '[]'::jsonb;
alter table decks add column if not exists type text default 'carousel';   -- carousel | story | branding

alter table decks enable row level security;
-- The backend uses the SERVICE ROLE key (bypasses RLS); keep RLS on so the
-- public anon key can never read decks directly.

-- ---------- talents + assignment ----------

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
-- Force a password change on the talent's first login (account created by the owner).
alter table talents add column if not exists must_reset boolean default false;

create index if not exists talents_email_idx on talents (lower(email));

-- Assign an order to a Talent (by email). Null = unassigned.
alter table orders add column if not exists talent_email text;
create index if not exists orders_talent_idx on orders (talent_email);

alter table talents enable row level security;
-- Backend uses the SERVICE ROLE key (bypasses RLS); keep RLS on so password
-- hashes can never be read from the public anon key.

-- Bootstrap your owner account: pick an email, then set the password from the
-- panel's first login is not possible, instead create it once via the API
-- (POST /api/auth { action:'bootstrap', email, password, name } with the
-- x-admin-token header = ADMIN_TOKEN). See README/notes.

-- ---------- messages (client <-> talent thread per order) ----------

create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  order_id    uuid references orders(id) on delete cascade,
  deck_id     uuid references decks(id) on delete set null,  -- optional: the asset this message is about
  sender      text,                                          -- 'client' | 'studio'
  sender_name text,
  body        text,
  images      jsonb default '[]'::jsonb                       -- attached image refs (data URLs / links)
);
create index if not exists messages_order_idx on messages (order_id, created_at);
-- existing databases: add the attachments column if it isn't there yet
alter table messages add column if not exists images jsonb default '[]'::jsonb;

alter table messages enable row level security;
-- Backend uses the SERVICE ROLE key (bypasses RLS); keep RLS on so the thread
-- can never be read from the public anon key.
