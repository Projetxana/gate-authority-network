create table if not exists public.gate_verified_effect_events (
  id uuid primary key default gen_random_uuid(),
  verification_id text not null,
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  api_key_id uuid references public.gate_api_keys(id) on delete set null,
  occurred_at timestamptz not null default now(),
  protocol text not null default 'unknown',
  operation text not null,
  authority text,
  decision text not null,
  receipt_version text,
  consistency text,
  served_by text,
  region text,
  constraint gate_verified_effect_events_project_verification_unique
    unique (project_id, verification_id),
  constraint gate_verified_effect_events_verification_id_check
    check (verification_id ~ '^gv_[A-Za-z0-9_-]{8,120}$'),
  constraint gate_verified_effect_events_protocol_check
    check (protocol = any (array[
      'mcp','http','x402','authzen','a2a','ap2','oauth','internal','unknown'
    ])),
  constraint gate_verified_effect_events_operation_check
    check (char_length(operation) between 1 and 160),
  constraint gate_verified_effect_events_authority_check
    check (authority is null or authority = any (array['VALID','INVALID','UNKNOWN'])),
  constraint gate_verified_effect_events_decision_check
    check (decision = any (array['ALLOW','DENY','ERROR'])),
  constraint gate_verified_effect_events_consistency_check
    check (consistency is null or consistency = any (array['bounded','strict'])),
  constraint gate_verified_effect_events_receipt_version_check
    check (receipt_version is null or char_length(receipt_version) <= 80),
  constraint gate_verified_effect_events_served_by_check
    check (served_by is null or char_length(served_by) <= 120),
  constraint gate_verified_effect_events_region_check
    check (region is null or char_length(region) <= 80)
);

comment on table public.gate_verified_effect_events is
  'Privacy-minimized effect-boundary metering. One row means GATE evaluated authority immediately before a concrete consequential effect. No principal, actor, resource, parameters, prompt, token, credential or payload content is stored.';

alter table public.gate_verified_effect_events enable row level security;

create index if not exists gate_verified_effect_events_occurred_at_idx
  on public.gate_verified_effect_events (occurred_at desc);

create index if not exists gate_verified_effect_events_project_occurred_at_idx
  on public.gate_verified_effect_events (project_id, occurred_at desc);

create index if not exists gate_verified_effect_events_protocol_occurred_at_idx
  on public.gate_verified_effect_events (protocol, occurred_at desc);

create table if not exists public.gate_daily_verified_effects (
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  day date not null,
  protocol text not null,
  effect_count bigint not null default 0 check (effect_count >= 0),
  allow_count bigint not null default 0 check (allow_count >= 0),
  deny_count bigint not null default 0 check (deny_count >= 0),
  unknown_count bigint not null default 0 check (unknown_count >= 0),
  error_count bigint not null default 0 check (error_count >= 0),
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  primary key (project_id, day, protocol),
  constraint gate_daily_verified_effects_protocol_check
    check (protocol = any (array[
      'mcp','http','x402','authzen','a2a','ap2','oauth','internal','unknown'
    ]))
);

comment on table public.gate_daily_verified_effects is
  'Daily project/protocol rollup for the GATE Verified Effects economic unit.';

alter table public.gate_daily_verified_effects enable row level security;

create or replace function public.gate_rollup_verified_effect()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  insert into public.gate_daily_verified_effects (
    project_id, day, protocol, effect_count, allow_count, deny_count,
    unknown_count, error_count, first_seen_at, last_seen_at
  )
  values (
    new.project_id,
    (new.occurred_at at time zone 'UTC')::date,
    new.protocol,
    1,
    case when new.decision = 'ALLOW' then 1 else 0 end,
    case when new.decision = 'DENY' then 1 else 0 end,
    case when new.authority = 'UNKNOWN' then 1 else 0 end,
    case when new.decision = 'ERROR' then 1 else 0 end,
    new.occurred_at,
    new.occurred_at
  )
  on conflict (project_id, day, protocol) do update
  set
    effect_count = public.gate_daily_verified_effects.effect_count + 1,
    allow_count = public.gate_daily_verified_effects.allow_count
      + case when new.decision = 'ALLOW' then 1 else 0 end,
    deny_count = public.gate_daily_verified_effects.deny_count
      + case when new.decision = 'DENY' then 1 else 0 end,
    unknown_count = public.gate_daily_verified_effects.unknown_count
      + case when new.authority = 'UNKNOWN' then 1 else 0 end,
    error_count = public.gate_daily_verified_effects.error_count
      + case when new.decision = 'ERROR' then 1 else 0 end,
    first_seen_at = least(
      coalesce(public.gate_daily_verified_effects.first_seen_at, new.occurred_at),
      new.occurred_at
    ),
    last_seen_at = greatest(
      coalesce(public.gate_daily_verified_effects.last_seen_at, new.occurred_at),
      new.occurred_at
    );

  return new;
end;
$function$;

drop trigger if exists gate_verified_effect_rollup
  on public.gate_verified_effect_events;

create trigger gate_verified_effect_rollup
after insert on public.gate_verified_effect_events
for each row execute function public.gate_rollup_verified_effect();

create or replace view public.gate_verified_effects_daily as
select
  d.day,
  d.protocol,
  sum(d.effect_count)::bigint as verified_effects,
  sum(d.allow_count)::bigint as allow_count,
  sum(d.deny_count)::bigint as deny_count,
  sum(d.unknown_count)::bigint as unknown_count,
  sum(d.error_count)::bigint as error_count,
  count(*) filter (where d.effect_count > 0)::bigint as active_projects
from public.gate_daily_verified_effects d
join public.gate_projects p on p.id = d.project_id
where p.is_internal = false
group by d.day, d.protocol;

create or replace view public.gate_verified_effects_summary as
with scoped as (
  select d.*
  from public.gate_daily_verified_effects d
  join public.gate_projects p on p.id = d.project_id
  where p.is_internal = false
),
last30 as (
  select *
  from scoped
  where day >= current_date - 29
)
select
  coalesce((select sum(effect_count) from scoped where day = current_date), 0)::bigint
    as verified_effects_today,
  coalesce((select sum(effect_count) from last30), 0)::bigint
    as verified_effects_30d,
  coalesce((select sum(allow_count) from last30), 0)::bigint as allow_30d,
  coalesce((select sum(deny_count) from last30), 0)::bigint as deny_30d,
  coalesce((select sum(unknown_count) from last30), 0)::bigint as unknown_30d,
  coalesce((select sum(error_count) from last30), 0)::bigint as errors_30d,
  coalesce((select sum(effect_count) from last30 where protocol='mcp'), 0)::bigint as mcp_30d,
  coalesce((select sum(effect_count) from last30 where protocol='http'), 0)::bigint as http_30d,
  coalesce((select sum(effect_count) from last30 where protocol='x402'), 0)::bigint as x402_30d,
  coalesce((select sum(effect_count) from last30 where protocol='authzen'), 0)::bigint as authzen_30d,
  coalesce((select sum(effect_count) from last30 where protocol='a2a'), 0)::bigint as a2a_30d,
  coalesce((select sum(effect_count) from last30 where protocol='ap2'), 0)::bigint as ap2_30d,
  count(distinct project_id) filter (
    where day = current_date and effect_count > 0
  )::bigint as active_effect_projects_today
from last30;

alter view public.gate_verified_effects_daily set (security_invoker = true);
alter view public.gate_verified_effects_summary set (security_invoker = true);

create index if not exists gate_verified_effect_events_api_key_idx
  on public.gate_verified_effect_events (api_key_id)
  where api_key_id is not null;

