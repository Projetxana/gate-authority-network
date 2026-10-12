
create table if not exists public.gate_sandbox_registrations (
  id bigserial primary key,
  day date not null default current_date,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists gate_sandbox_registrations_day_idx
  on public.gate_sandbox_registrations(day);

create index if not exists gate_sandbox_registrations_day_ip_idx
  on public.gate_sandbox_registrations(day, ip_hash);

alter table public.gate_sandbox_registrations enable row level security;

drop policy if exists gate_sandbox_registrations_no_client_access
  on public.gate_sandbox_registrations;

create policy gate_sandbox_registrations_no_client_access
  on public.gate_sandbox_registrations
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on public.gate_sandbox_registrations from anon, authenticated;
grant select, insert, delete on public.gate_sandbox_registrations to service_role;

drop view if exists public.gate_adoption_summary;

create view public.gate_adoption_summary as
with scope as (
  select p.*
  from public.gate_projects p
  where p.is_internal = false
),
usage_30d as (
  select d.*, p.plan
  from public.gate_daily_usage d
  join scope p on p.id = d.project_id
  where d.day >= current_date - 29
),
events_30d as (
  select e.*
  from public.gate_verification_events e
  join scope p on p.id = e.project_id
  where e.occurred_at >= now() - interval '30 days'
)
select
  (select count(*) from scope where first_verified_at is not null)
    as activated_projects,
  (select count(distinct project_id) from usage_30d where day = current_date)
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
    select percentile_cont(0.5) within group (order by latency_ms::double precision)
    from events_30d
    where latency_ms is not null
  )::numeric(12,2) as latency_p50_ms,
  (
    select percentile_cont(0.99) within group (order by latency_ms::double precision)
    from events_30d
    where latency_ms is not null
  )::numeric(12,2) as latency_p99_ms,
  (select count(*) from scope where plan = 'developer' and first_verified_at is not null)
    as preview_activated_projects,
  (select count(*) from scope where plan = 'pilot' and first_verified_at is not null)
    as pilot_activated_projects,
  (select count(*) from scope where plan = 'paid' and first_verified_at is not null)
    as paid_activated_projects,
  coalesce((select sum(verification_count) from usage_30d where plan = 'developer'), 0)::bigint
    as preview_verifications_30d,
  coalesce((select sum(verification_count) from usage_30d where plan in ('pilot','paid')), 0)::bigint
    as pilot_paid_verifications_30d;
;
