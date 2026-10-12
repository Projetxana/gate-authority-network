
alter table public.gate_live_edges
  add column if not exists valid_until timestamptz;

update public.gate_plan_entitlements
set max_projects = 1,
    overage_enabled = false,
    overage_usd_per_million = null,
    updated_at = now()
where plan in ('free','pro','scale');

create or replace function public.gate_ingest_authority_event_v2(
  p_project_id uuid,
  p_authority_issuer_id uuid,
  p_jti text,
  p_edge_id text,
  p_issuer_principal text,
  p_subject_principal text,
  p_status text,
  p_sequence bigint,
  p_reason text,
  p_event_timestamp timestamptz,
  p_valid_until timestamptz,
  p_event_hash text
)
returns table(edge_id text, status text, sequence bigint, valid_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_sequence bigint;
begin
  if p_status not in ('ACTIVE','REVOKED','UNKNOWN') then
    raise exception 'unsupported_authority_status';
  end if;
  if p_sequence < 1 then
    raise exception 'invalid_event_sequence';
  end if;
  if p_status = 'ACTIVE' and p_valid_until is null then
    raise exception 'active_authority_requires_valid_until';
  end if;
  if not exists (
    select 1 from public.gate_authority_issuers
    where id = p_authority_issuer_id
      and project_id = p_project_id
      and status = 'active'
  ) then
    raise exception 'authority_issuer_not_active';
  end if;

  if exists (
    select 1 from public.gate_authority_events
    where project_id = p_project_id and jti = p_jti
  ) then
    raise exception 'authority_event_replay';
  end if;

  select e.sequence into v_current_sequence
  from public.gate_live_edges e
  where e.project_id = p_project_id and e.edge_id = p_edge_id
  for update;

  if v_current_sequence is not null and p_sequence <= v_current_sequence then
    raise exception 'stale_authority_event';
  end if;

  insert into public.gate_authority_events(
    project_id, authority_issuer_id, jti, edge_id, sequence, status, event_hash
  ) values (
    p_project_id, p_authority_issuer_id, p_jti, p_edge_id, p_sequence, p_status, p_event_hash
  );

  insert into public.gate_live_edges(
    project_id, edge_id, issuer, subject, status, sequence,
    authority_issuer_id, updated_at, revoked_at, reason, last_event_jti, valid_until
  ) values (
    p_project_id, p_edge_id, p_issuer_principal, p_subject_principal, p_status, p_sequence,
    p_authority_issuer_id, coalesce(p_event_timestamp, now()),
    case when p_status = 'REVOKED' then coalesce(p_event_timestamp, now()) else null end,
    p_reason, p_jti,
    case when p_status = 'ACTIVE' then p_valid_until else null end
  )
  on conflict (project_id, edge_id) do update set
    issuer = excluded.issuer,
    subject = excluded.subject,
    status = excluded.status,
    sequence = excluded.sequence,
    authority_issuer_id = excluded.authority_issuer_id,
    updated_at = excluded.updated_at,
    revoked_at = excluded.revoked_at,
    reason = excluded.reason,
    last_event_jti = excluded.last_event_jti,
    valid_until = excluded.valid_until;

  return query select p_edge_id, p_status, p_sequence,
    case when p_status = 'ACTIVE' then p_valid_until else null end;
end;
$$;

revoke all on function public.gate_ingest_authority_event_v2(uuid,uuid,text,text,text,text,text,bigint,text,timestamptz,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.gate_ingest_authority_event_v2(uuid,uuid,text,text,text,text,text,bigint,text,timestamptz,timestamptz,text)
  to service_role;
;
