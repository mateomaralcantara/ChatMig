-- Habilitar extensiones útiles
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- PROFILE (opcional simple, espejo de auth.users)
create table if not exists public.profile (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  email_verified boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- MEMBERSHIP
create table if not exists public.membership (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'free', -- free | pro | business
  active boolean not null default false,
  stripe_customer_id text,
  stripe_subscription_id text,
  daily_token_quota int not null default 2000,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_membership_sub on public.membership (stripe_subscription_id);

-- USAGE COUNTERS (cuotas por día)
create table if not exists public.usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  tokens_used int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- PAYMENT EVENTS (auditoría opcional)
create table if not exists public.payment_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users (id) on delete set null,
  stripe_event_id text unique not null,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
