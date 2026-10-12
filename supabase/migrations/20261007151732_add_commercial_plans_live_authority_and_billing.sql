
-- GATE commercial plans + live authority runtime + billing state

alter table public.gate_projects drop constraint if exists gate_projects_plan_check;
alter table public.gate_projects alter column plan set default 'free';
alter table public.gate_projects
  add constraint gate_projects_plan_check
  check (plan = any (array['sandbox'::text,'free'::text,'pro'::text,'scale'::text,'internal'::text]));

create table if not exists public.gate_plan_entitlements (
  plan text primary key,
  monthly_verification_limit bigint not null check (monthly_verification_limit >= 0),
  max_projects integer not null check (max_projects >= 1),
  max_issuers integer not null check (max_issuers >= 1),
  max_active_api_keys integer not null check (max_active_api_keys >= 1),
  allow_strict boolean not null default false,
  audit_retention_days integer not null default 7 check (audit_retention_days >= 1),
  overage_enabled boolean not null default false,
  overage_usd_per_million numeric(12,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.gate_plan_entitlements
(plan, monthly_verification_limit, max_projects, max_issuers, max_active_api_keys, allow_strict, audit_retention_days, overage_enabled, overage_usd_per_million)
values
  ('sandbox', 15000, 1, 1, 1, false, 1, false, null),
  ('free', 50000, 1, 1, 1, false, 7, false, null),
  ('pro', 1000000, 5, 10, 5, true, 30, true, 30.00),
  ('scale', 10000000, 25, 100, 20, true, 90, true, 20.00),
  ('internal', 9223372036854775807, 1000, 1000, 1000, true, 3650, false, null)
on conflict (plan) do update set
  monthly_verification_limit = excluded.monthly_verification_limit,
  max_projects = excluded.max_projects,
  max_issuers = excluded.max_issuers,
  max_active_api_keys = excluded.max_active_api_keys,
  allow_strict = excluded.allow_strict,
  audit_retention_days = excluded.audit_retention_days,
  overage_enabled = excluded.overage_enabled,
  overage_usd_per_million = excluded.overage_usd_per_million,
  updated_at = now();

create table if not exists public.gate_authority_issuers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  issuer text not null,
  key_id text not null,
  alg text not null default 'ES256' check (alg = 'ES256'),
  public_jwk jsonb not null,
  principal_patterns text[] not null default array[]::text[],
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, issuer),
  unique(project_id, key_id)
);

create index if not exists gate_authority_issuers_project_idx
  on public.gate_authority_issuers(project_id, status);

create table if not exists public.gate_live_edges (
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  edge_id text not null,
  issuer text not null,
  subject text not null,
  status text not null check (status in ('ACTIVE','REVOKED','UNKNOWN')),
  sequence bigint not null check (sequence >= 1),
  authority_issuer_id uuid not null references public.gate_authority_issuers(id) on delete restrict,
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  reason text,
  last_event_jti text not null,
  primary key(project_id, edge_id)
);

create index if not exists gate_live_edges_graph_idx
  on public.gate_live_edges(project_id, issuer, subject, status);

create table if not exists public.gate_authority_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  authority_issuer_id uuid not null references public.gate_authority_issuers(id) on delete restrict,
  jti text not null,
  edge_id text not null,
  sequence bigint not null,
  status text not null check (status in ('ACTIVE','REVOKED','UNKNOWN')),
  event_hash text not null,
  accepted_at timestamptz not null default now(),
  unique(project_id, jti)
);

create index if not exists gate_authority_events_edge_idx
  on public.gate_authority_events(project_id, edge_id, sequence desc);

create table if not exists public.gate_billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan text not null check (plan in ('pro','scale')),
  status text not null default 'pending',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gate_billing_subscriptions_project_idx
  on public.gate_billing_subscriptions(project_id, status);

create table if not exists public.gate_billing_events (
  stripe_event_id text primary key,
  event_type text not null,
  livemode boolean not null,
  project_id uuid references public.gate_projects(id) on delete set null,
  payload_hash text not null,
  processed_at timestamptz not null default now()
);

create table if not exists public.gate_live_registrations (
  id uuid primary key default gen_random_uuid(),
  day date not null default current_date,
  ip_hash text,
  project_id uuid references public.gate_projects(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists gate_live_registrations_day_idx on public.gate_live_registrations(day);
create index if not exists gate_live_registrations_ip_idx on public.gate_live_registrations(day, ip_hash);

create or replace function public.gate_authenticate_api_key_v2(p_secret text)
returns table(project_id uuid, api_key_id uuid, plan text)
language sql
stable security definer
set search_path = public, extensions
as $$
  select k.project_id, k.id, p.plan
  from public.gate_api_keys k
  join public.gate_projects p on p.id = k.project_id
  where k.key_hash = encode(digest(p_secret, 'sha256'), 'hex')
    and k.status = 'active'
    and p.status = 'active'
    and (k.expires_at is null or k.expires_at > now())
  limit 1;
$$;

create or replace function public.gate_project_usage_month(p_project_id uuid)
returns bigint
language sql
stable security definer
set search_path = public
as $$
  select coalesce(sum(verification_count),0)::bigint
  from public.gate_daily_usage
  where project_id = p_project_id
    and day >= date_trunc('month', now() at time zone 'UTC')::date
    and day < (date_trunc('month', now() at time zone 'UTC') + interval '1 month')::date;
$$;

create or replace function public.gate_project_entitlements(p_project_id uuid)
returns table(
  plan text,
  monthly_verification_limit bigint,
  current_month_usage bigint,
  max_projects integer,
  max_issuers integer,
  max_active_api_keys integer,
  allow_strict boolean,
  audit_retention_days integer,
  overage_enabled boolean,
  overage_usd_per_million numeric
)
language sql
stable security definer
set search_path = public
as $$
  select
    p.plan,
    e.monthly_verification_limit,
    public.gate_project_usage_month(p.id),
    e.max_projects,
    e.max_issuers,
    e.max_active_api_keys,
    e.allow_strict,
    e.audit_retention_days,
    e.overage_enabled,
    e.overage_usd_per_million
  from public.gate_projects p
  join public.gate_plan_entitlements e on e.plan = p.plan
  where p.id = p_project_id
  limit 1;
$$;

create or replace function public.gate_get_runtime_secret(p_name text)
returns text
language plpgsql
stable security definer
set search_path = public, vault
as $$
declare
  v_role text;
  v_secret text;
begin
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  if v_role <> 'service_role' then
    raise exception 'gate_secret_access_denied';
  end if;

  select decrypted_secret
    into v_secret
  from vault.decrypted_secrets
  where name = p_name
  order by created_at desc
  limit 1;

  return v_secret;
end;
$$;

revoke all on function public.gate_get_runtime_secret(text) from public, anon, authenticated;
grant execute on function public.gate_get_runtime_secret(text) to service_role;

create or replace function public.gate_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists gate_plan_entitlements_updated_at on public.gate_plan_entitlements;
create trigger gate_plan_entitlements_updated_at before update on public.gate_plan_entitlements
for each row execute function public.gate_set_updated_at();

drop trigger if exists gate_authority_issuers_updated_at on public.gate_authority_issuers;
create trigger gate_authority_issuers_updated_at before update on public.gate_authority_issuers
for each row execute function public.gate_set_updated_at();

drop trigger if exists gate_billing_subscriptions_updated_at on public.gate_billing_subscriptions;
create trigger gate_billing_subscriptions_updated_at before update on public.gate_billing_subscriptions
for each row execute function public.gate_set_updated_at();

alter table public.gate_plan_entitlements enable row level security;
alter table public.gate_authority_issuers enable row level security;
alter table public.gate_live_edges enable row level security;
alter table public.gate_authority_events enable row level security;
alter table public.gate_billing_subscriptions enable row level security;
alter table public.gate_billing_events enable row level security;
alter table public.gate_live_registrations enable row level security;
;
