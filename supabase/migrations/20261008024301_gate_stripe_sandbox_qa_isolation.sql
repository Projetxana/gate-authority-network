
create table if not exists public.gate_qa_billing_projects (
  id uuid primary key,
  slug text not null unique,
  plan text not null default 'free' check (plan in ('free','pro','scale')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.gate_qa_billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.gate_qa_billing_projects(id),
  stripe_customer_id text,
  stripe_subscription_id text unique not null,
  stripe_price_id text,
  plan text not null check (plan in ('pro','scale')),
  status text not null default 'pending',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.gate_qa_billing_events (
  stripe_event_id text primary key,
  event_type text not null,
  livemode boolean not null default false check (livemode=false),
  project_id uuid references public.gate_qa_billing_projects(id),
  payload_hash text not null,
  processed_at timestamptz not null default now()
);
alter table public.gate_qa_billing_projects enable row level security;
alter table public.gate_qa_billing_subscriptions enable row level security;
alter table public.gate_qa_billing_events enable row level security;
revoke all on table public.gate_qa_billing_projects, public.gate_qa_billing_subscriptions, public.gate_qa_billing_events from public, anon, authenticated;
grant select,insert,update,delete on table public.gate_qa_billing_projects, public.gate_qa_billing_subscriptions, public.gate_qa_billing_events to service_role;
insert into public.gate_qa_billing_projects(id,slug,plan)
values ('00000000-0000-4000-8000-00000000a001','gate-stripe-sandbox-qa','free')
on conflict (id) do nothing;
;
