
create table if not exists public.gate_metered_verification_usage (
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  month_utc date not null,
  used bigint not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key(project_id, month_utc)
);
alter table public.gate_metered_verification_usage enable row level security;
revoke all on table public.gate_metered_verification_usage from public, anon, authenticated;
grant select,insert,update,delete on table public.gate_metered_verification_usage to service_role;

create or replace function public.gate_record_metered_verification(
  p_project_id uuid,
  p_api_key_id uuid,
  p_source text,
  p_client_version text,
  p_decision text,
  p_authority text,
  p_consistency text,
  p_latency_ms integer
)
returns table (
  allowed boolean,
  plan text,
  current_month_usage bigint,
  monthly_limit bigint
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_plan text;
  v_limit bigint;
  v_overage boolean;
  v_used bigint;
  v_new_used bigint;
  v_month date := date_trunc('month',now() at time zone 'UTC')::date;
begin
  if p_project_id is null then
    raise exception 'invalid_gate_project' using errcode='22023';
  end if;

  -- Serialize real verification metering for this project, including parallel API requests.
  perform pg_catalog.pg_advisory_xact_lock(412943, pg_catalog.hashtext(p_project_id::text));

  select p.plan,e.monthly_verification_limit,e.overage_enabled
    into v_plan,v_limit,v_overage
  from public.gate_projects p
  join public.gate_plan_entitlements e on e.plan=p.plan
  where p.id=p_project_id and p.status='active';

  if not found then
    raise exception 'unknown_or_inactive_gate_project' using errcode='22023';
  end if;

  select q.used into v_used
  from public.gate_metered_verification_usage q
  where q.project_id=p_project_id and q.month_utc=v_month;
  v_used := coalesce(v_used,0);

  if (not v_overage and v_used >= v_limit) then
    return query select false,v_plan,v_used,v_limit;
    return;
  end if;

  -- Both telemetry and the billable quota increment succeed or roll back together.
  insert into public.gate_verification_events(
    project_id,api_key_id,source,client_version,decision,authority,consistency,latency_ms
  ) values (
    p_project_id,p_api_key_id,p_source,p_client_version,p_decision,p_authority,
    p_consistency,p_latency_ms
  );

  insert into public.gate_metered_verification_usage(project_id,month_utc,used)
  values(p_project_id,v_month,1)
  on conflict(project_id,month_utc) do update
    set used=public.gate_metered_verification_usage.used+1,updated_at=now()
  returning used into v_new_used;

  return query select true,v_plan,v_new_used,v_limit;
end;
$$;
revoke all on function public.gate_record_metered_verification(uuid,uuid,text,text,text,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.gate_record_metered_verification(uuid,uuid,text,text,text,text,text,integer) to service_role;

create or replace function public.gate_project_entitlements(p_project_id uuid)
returns table (
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
stable
security definer
set search_path = ''
as $$
  select
    p.plan,e.monthly_verification_limit,coalesce(q.used,0)::bigint,
    e.max_projects,e.max_issuers,e.max_active_api_keys,
    e.allow_strict,e.audit_retention_days,e.overage_enabled,
    e.overage_usd_per_million
  from public.gate_projects p
  join public.gate_plan_entitlements e on e.plan=p.plan
  left join public.gate_metered_verification_usage q
    on q.project_id=p.id
    and q.month_utc=date_trunc('month',now() at time zone 'UTC')::date
  where p.id=p_project_id
  limit 1;
$$;
;
