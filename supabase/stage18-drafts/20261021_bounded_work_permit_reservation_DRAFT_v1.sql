-- STAGE18 REVIEW / DISPOSABLE POSTGRES ONLY. NEVER APPLY TO PRODUCTION.
-- This draft reserves a short-lived, exact-action permit under the existing
-- scoped reader's project+issuer+work locks, then atomically consumes it with
-- a SECOND CURRENT-state authorization check. No external effect is executed.
-- SQL does NOT sign the JWS; a future trusted GATE server owns the ES256 key.
-- Transactional DDL avoids any externally visible default-PUBLIC EXECUTE window.
begin;

create table public.gate_bounded_work_permit_reservations_DRAFT_v1 (
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  jti uuid not null,
  authority_issuer_id uuid not null,
  work_id text not null,
  principal text not null,
  actor text not null,
  protocol text not null,
  action_name text not null,
  resource text not null,
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  audience text not null,
  accepted_sequence bigint not null check (accepted_sequence > 0),
  issued_at_seconds bigint not null,
  expires_at_seconds bigint not null,
  checkpoint_not_after_ms bigint not null,
  consumed_at timestamptz,
  primary key(project_id,jti),
  check (expires_at_seconds > issued_at_seconds and
         expires_at_seconds <= issued_at_seconds + 5),
  check (expires_at_seconds * 1000 <= checkpoint_not_after_ms)
);
alter table public.gate_bounded_work_permit_reservations_DRAFT_v1 enable row level security;
revoke all on public.gate_bounded_work_permit_reservations_DRAFT_v1
 from public, anon, authenticated, service_role;

-- Intended caller: privileged GATE backend only, AFTER project API-key auth.
-- p_project_id MUST be derived server-side from the authenticated API key;
-- issuer and work are looked up in tenant-scoped trusted state. This function
-- does not itself authenticate any HTTP request.
create function public.gate_reserve_bounded_work_effect_permit_DRAFT_v1(
  p_project_id uuid, p_authority_issuer_id uuid, p_work_id text,
  p_principal text, p_actor text, p_protocol text, p_name text,
  p_resource text, p_input_sha256 text, p_audience text
)
returns table(jti text, project_id uuid, authority_issuer_id uuid,
  work_id text, principal text, actor text, protocol text, action_name text,
  resource text, input_sha256 text, audience text,
  accepted_sequence bigint, issued_at_seconds bigint,
  expires_at_seconds bigint, checkpoint_not_after_ms bigint)
language plpgsql volatile security definer set search_path = ''
as $gate$
declare
  v_decision record;
  v_now timestamptz;
  v_iat bigint;
  v_exp bigint;
  v_jti uuid;
  v_checkpoint_ms bigint;
begin
  if p_protocol is distinct from 'mcp' or
     p_name is null or p_name not like 'tools/call:%' or
     pg_catalog.length(p_name) not between 12 and 256 or
     p_resource is null or pg_catalog.length(p_resource) not between 1 and 256 or
     p_input_sha256 is null or p_input_sha256 !~ '^[0-9a-f]{64}$' or
     p_audience is null or pg_catalog.length(p_audience) not between 1 and 256 or
     p_audience <> pg_catalog.btrim(p_audience) then
    raise exception 'bounded_permit_invalid_request';
  end if;

  -- FOR SHARE locks live project, issuer trust/key, and work state until COMMIT.
  select v.* into v_decision from public.gate_verify_bounded_work_effect_v1(
    p_project_id,p_authority_issuer_id,p_work_id,p_principal,p_actor,
    p_protocol,p_name,p_resource
  ) v;
  if v_decision.decision is distinct from 'ALLOW' or
     v_decision.authority is distinct from 'VALID' then
    raise exception 'bounded_permit_authority_denied';
  end if;

  -- No stale clock sampled before acquiring the locks.
  v_now:=pg_catalog.clock_timestamp();
  v_iat:=pg_catalog.floor(extract(epoch from v_now))::bigint;
  v_checkpoint_ms:=pg_catalog.floor(extract(epoch from v_decision.checkpoint_not_after)*1000)::bigint;
  -- Full-second exp is deliberately conservative: a permit cannot outlive
  -- the signed issuer checkpoint and is never more than five seconds.
  v_exp:=least(v_iat+4,pg_catalog.floor(v_checkpoint_ms/1000.0)::bigint);
  if v_exp*1000 <= pg_catalog.floor(extract(epoch from v_now)*1000)::bigint or
     v_exp<=v_iat then
    raise exception 'bounded_permit_fresh_lease_required';
  end if;
  v_jti:=pg_catalog.gen_random_uuid();
  insert into public.gate_bounded_work_permit_reservations_DRAFT_v1 (
    project_id,jti,authority_issuer_id,work_id,principal,actor,
    protocol,action_name,resource,input_sha256,audience,
    accepted_sequence,issued_at_seconds,expires_at_seconds,checkpoint_not_after_ms
  ) values (
    p_project_id,v_jti,p_authority_issuer_id,p_work_id,p_principal,p_actor,
    p_protocol,p_name,p_resource,p_input_sha256,p_audience,
    v_decision.accepted_sequence,v_iat,v_exp,v_checkpoint_ms
  );
  return query select v_jti::text,p_project_id,p_authority_issuer_id,p_work_id,
    p_principal,p_actor,p_protocol,p_name,p_resource,p_input_sha256,p_audience,
    v_decision.accepted_sequence::bigint,v_iat,v_exp,v_checkpoint_ms;
end;
$gate$;
revoke all on function public.gate_reserve_bounded_work_effect_permit_DRAFT_v1(
  uuid,uuid,text,text,text,text,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.gate_reserve_bounded_work_effect_permit_DRAFT_v1(
  uuid,uuid,text,text,text,text,text,text,text,text
) to service_role;

-- Intended caller: trusted resource-side consumer via a hosted endpoint that
-- verifies the GATE-signed JWT and authenticates the protected audience.
-- The RPC does not itself validate a JWT or a resource-owner identity.
create function public.gate_consume_bounded_work_effect_permit_DRAFT_v1(
  p_project_id uuid, p_jti uuid, p_authority_issuer_id uuid,
  p_work_id text, p_principal text, p_actor text,
  p_protocol text, p_name text, p_resource text,
  p_input_sha256 text, p_audience text, p_accepted_sequence bigint
)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $gate$
declare
  v_decision record;
  v_rows integer;
begin
  if p_jti is null or p_input_sha256 is null or
     p_input_sha256 !~ '^[0-9a-f]{64}$' or
     p_accepted_sequence is null or p_accepted_sequence < 1 or
     p_audience is null or p_audience='' then
    return false;
  end if;
  -- This read locks the SAME live work, project and issuer trust rows, and
  -- revalidates all exact permissions, current status and signed checkpoint.
  select v.* into v_decision from public.gate_verify_bounded_work_effect_v1(
    p_project_id,p_authority_issuer_id,p_work_id,p_principal,p_actor,
    p_protocol,p_name,p_resource
  ) v;
  if v_decision.decision is distinct from 'ALLOW' or
     v_decision.authority is distinct from 'VALID' or
     v_decision.accepted_sequence is distinct from p_accepted_sequence then
    return false;
  end if;
  -- One atomic UPDATE; at READ COMMITTED concurrent consumers serialize and
  -- the loser sees consumed_at != NULL. Every claim is bound to its row.
  update public.gate_bounded_work_permit_reservations_DRAFT_v1 r
     set consumed_at=pg_catalog.clock_timestamp()
   where r.project_id=p_project_id and r.jti=p_jti
     and r.authority_issuer_id=p_authority_issuer_id
     and r.work_id=p_work_id and r.principal=p_principal and r.actor=p_actor
     and r.protocol=p_protocol and r.action_name=p_name and r.resource=p_resource
     and r.input_sha256=p_input_sha256 and r.audience=p_audience
     and r.accepted_sequence=p_accepted_sequence
     and r.consumed_at is null
     and r.expires_at_seconds > extract(epoch from pg_catalog.clock_timestamp())
     and r.expires_at_seconds * 1000 <= r.checkpoint_not_after_ms
     and r.checkpoint_not_after_ms > extract(epoch from pg_catalog.clock_timestamp())*1000;
  get diagnostics v_rows=row_count;
  return v_rows=1;
end;
$gate$;
revoke all on function public.gate_consume_bounded_work_effect_permit_DRAFT_v1(
  uuid,uuid,uuid,text,text,text,text,text,text,text,text,bigint
) from public,anon,authenticated;
grant execute on function public.gate_consume_bounded_work_effect_permit_DRAFT_v1(
  uuid,uuid,uuid,text,text,text,text,text,text,text,text,bigint
) to service_role;

commit;
