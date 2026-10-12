
create extension if not exists pgcrypto with schema extensions;

create table public.gate_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  display_name text not null,
  status text not null default 'active'
    check (status in ('active','suspended','closed')),
  plan text not null default 'developer'
    check (plan in ('developer','pilot','paid','internal')),
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  first_verified_at timestamptz,
  last_verified_at timestamptz
);

create table public.gate_api_keys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  name text not null default 'default',
  key_prefix text not null,
  key_hash text not null unique,
  status text not null default 'active'
    check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);

create index gate_api_keys_project_idx
  on public.gate_api_keys(project_id);

create table public.gate_verification_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null default gen_random_uuid(),
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  api_key_id uuid references public.gate_api_keys(id) on delete set null,
  occurred_at timestamptz not null default now(),
  source text not null default 'api'
    check (source in ('sdk','mcp','api','internal','unknown')),
  client_version text,
  consistency text
    check (consistency is null or consistency in ('bounded','strict')),
  decision text not null
    check (decision in ('ALLOW','DENY','ERROR')),
  authority text
    check (authority is null or authority in ('VALID','INVALID','UNKNOWN')),
  latency_ms integer
    check (latency_ms is null or latency_ms >= 0),
  error_code text,
  constraint gate_verification_events_no_sensitive_payloads
    check (char_length(coalesce(error_code,'')) <= 120)
);

create index gate_verification_events_project_time_idx
  on public.gate_verification_events(project_id, occurred_at desc);

create index gate_verification_events_time_idx
  on public.gate_verification_events(occurred_at desc);

create index gate_verification_events_decision_idx
  on public.gate_verification_events(decision, occurred_at desc);

create table public.gate_daily_usage (
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  day date not null,
  verification_count bigint not null default 0 check (verification_count >= 0),
  allow_count bigint not null default 0 check (allow_count >= 0),
  deny_count bigint not null default 0 check (deny_count >= 0),
  unknown_count bigint not null default 0 check (unknown_count >= 0),
  error_count bigint not null default 0 check (error_count >= 0),
  latency_sum_ms bigint not null default 0 check (latency_sum_ms >= 0),
  latency_samples bigint not null default 0 check (latency_samples >= 0),
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  primary key (project_id, day)
);

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

create trigger gate_projects_set_updated_at
before update on public.gate_projects
for each row execute function public.gate_set_updated_at();

create or replace function public.gate_rollup_verification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.gate_daily_usage (
    project_id,
    day,
    verification_count,
    allow_count,
    deny_count,
    unknown_count,
    error_count,
    latency_sum_ms,
    latency_samples,
    first_seen_at,
    last_seen_at
  )
  values (
    new.project_id,
    (new.occurred_at at time zone 'UTC')::date,
    1,
    case when new.decision = 'ALLOW' then 1 else 0 end,
    case when new.decision = 'DENY' then 1 else 0 end,
    case when new.authority = 'UNKNOWN' then 1 else 0 end,
    case when new.decision = 'ERROR' then 1 else 0 end,
    coalesce(new.latency_ms, 0),
    case when new.latency_ms is null then 0 else 1 end,
    new.occurred_at,
    new.occurred_at
  )
  on conflict (project_id, day) do update
  set
    verification_count = public.gate_daily_usage.verification_count + 1,
    allow_count = public.gate_daily_usage.allow_count
      + case when new.decision = 'ALLOW' then 1 else 0 end,
    deny_count = public.gate_daily_usage.deny_count
      + case when new.decision = 'DENY' then 1 else 0 end,
    unknown_count = public.gate_daily_usage.unknown_count
      + case when new.authority = 'UNKNOWN' then 1 else 0 end,
    error_count = public.gate_daily_usage.error_count
      + case when new.decision = 'ERROR' then 1 else 0 end,
    latency_sum_ms = public.gate_daily_usage.latency_sum_ms
      + coalesce(new.latency_ms, 0),
    latency_samples = public.gate_daily_usage.latency_samples
      + case when new.latency_ms is null then 0 else 1 end,
    first_seen_at = least(
      coalesce(public.gate_daily_usage.first_seen_at, new.occurred_at),
      new.occurred_at
    ),
    last_seen_at = greatest(
      coalesce(public.gate_daily_usage.last_seen_at, new.occurred_at),
      new.occurred_at
    );

  update public.gate_projects
  set
    first_verified_at = coalesce(first_verified_at, new.occurred_at),
    last_verified_at = greatest(
      coalesce(last_verified_at, new.occurred_at),
      new.occurred_at
    )
  where id = new.project_id;

  if new.api_key_id is not null then
    update public.gate_api_keys
    set last_used_at = greatest(
      coalesce(last_used_at, new.occurred_at),
      new.occurred_at
    )
    where id = new.api_key_id;
  end if;

  return new;
end;
$$;

create trigger gate_verification_rollup
after insert on public.gate_verification_events
for each row execute function public.gate_rollup_verification();

create or replace function public.gate_create_api_key(
  p_project_id uuid,
  p_name text default 'default',
  p_expires_at timestamptz default null
)
returns table (
  api_key_id uuid,
  api_key_secret text,
  api_key_prefix text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_prefix text;
  v_id uuid;
begin
  if not exists (
    select 1
    from public.gate_projects
    where id = p_project_id
      and status = 'active'
  ) then
    raise exception 'gate_project_not_active';
  end if;

  v_secret := 'gate_sk_' || encode(gen_random_bytes(24), 'hex');
  v_prefix := left(v_secret, 16);

  insert into public.gate_api_keys (
    project_id,
    name,
    key_prefix,
    key_hash,
    expires_at
  )
  values (
    p_project_id,
    coalesce(nullif(trim(p_name), ''), 'default'),
    v_prefix,
    encode(digest(v_secret, 'sha256'), 'hex'),
    p_expires_at
  )
  returning id into v_id;

  api_key_id := v_id;
  api_key_secret := v_secret;
  api_key_prefix := v_prefix;
  return next;
end;
$$;

create or replace function public.gate_authenticate_api_key(
  p_secret text
)
returns table (
  project_id uuid,
  api_key_id uuid
)
language sql
security definer
stable
set search_path = public, extensions
as $$
  select
    k.project_id,
    k.id
  from public.gate_api_keys k
  join public.gate_projects p on p.id = k.project_id
  where k.key_hash = encode(digest(p_secret, 'sha256'), 'hex')
    and k.status = 'active'
    and p.status = 'active'
    and (k.expires_at is null or k.expires_at > now())
  limit 1;
$$;

create or replace view public.gate_adoption_daily
with (security_invoker = true)
as
select
  d.day,
  sum(d.verification_count)::bigint as verifications,
  sum(d.allow_count)::bigint as allow_count,
  sum(d.deny_count)::bigint as deny_count,
  sum(d.unknown_count)::bigint as unknown_count,
  sum(d.error_count)::bigint as error_count,
  count(*) filter (where d.verification_count > 0)::bigint as active_projects,
  case
    when sum(d.latency_samples) > 0
    then round(sum(d.latency_sum_ms)::numeric / sum(d.latency_samples), 2)
    else null
  end as avg_latency_ms
from public.gate_daily_usage d
join public.gate_projects p on p.id = d.project_id
where p.is_internal = false
group by d.day;

create or replace view public.gate_adoption_summary
with (security_invoker = true)
as
with scope as (
  select p.*
  from public.gate_projects p
  where p.is_internal = false
),
usage_30d as (
  select d.*
  from public.gate_daily_usage d
  join scope p on p.id = d.project_id
  where d.day >= (current_date - 29)
),
events_30d as (
  select e.*
  from public.gate_verification_events e
  join scope p on p.id = e.project_id
  where e.occurred_at >= (now() - interval '30 days')
)
select
  (select count(*) from scope where first_verified_at is not null)::bigint
    as activated_projects,
  (select count(distinct project_id) from usage_30d where day = current_date)::bigint
    as active_projects_today,
  coalesce((select sum(verification_count) from usage_30d where day = current_date), 0)::bigint
    as verifications_today,
  coalesce((select sum(verification_count) from usage_30d), 0)::bigint
    as verifications_30d,
  coalesce((select sum(allow_count) from usage_30d), 0)::bigint
    as allow_30d,
  coalesce((select sum(deny_count) from usage_30d), 0)::bigint
    as deny_30d,
  coalesce((select sum(unknown_count) from usage_30d), 0)::bigint
    as unknown_30d,
  coalesce((select sum(error_count) from usage_30d), 0)::bigint
    as errors_30d,
  (
    select percentile_cont(0.5) within group (order by latency_ms)
    from events_30d
    where latency_ms is not null
  )::numeric(12,2) as latency_p50_ms,
  (
    select percentile_cont(0.99) within group (order by latency_ms)
    from events_30d
    where latency_ms is not null
  )::numeric(12,2) as latency_p99_ms;

alter table public.gate_projects enable row level security;
alter table public.gate_api_keys enable row level security;
alter table public.gate_verification_events enable row level security;
alter table public.gate_daily_usage enable row level security;

revoke all on public.gate_projects from anon, authenticated;
revoke all on public.gate_api_keys from anon, authenticated;
revoke all on public.gate_verification_events from anon, authenticated;
revoke all on public.gate_daily_usage from anon, authenticated;
revoke all on public.gate_adoption_daily from anon, authenticated;
revoke all on public.gate_adoption_summary from anon, authenticated;

revoke all on function public.gate_create_api_key(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.gate_authenticate_api_key(text)
  from public, anon, authenticated;

grant select, insert, update, delete on public.gate_projects to service_role;
grant select, insert, update, delete on public.gate_api_keys to service_role;
grant select, insert, update, delete on public.gate_verification_events to service_role;
grant select, insert, update, delete on public.gate_daily_usage to service_role;
grant select on public.gate_adoption_daily to service_role;
grant select on public.gate_adoption_summary to service_role;
grant execute on function public.gate_create_api_key(uuid, text, timestamptz)
  to service_role;
grant execute on function public.gate_authenticate_api_key(text)
  to service_role;

comment on table public.gate_verification_events is
  'Privacy-minimized GATE verification telemetry. Do not store principal, actor, resource or action parameters here.';
;
