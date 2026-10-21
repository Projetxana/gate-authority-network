-- GATE STAGE18 LOCAL RESEARCH ONLY -- NEVER APPLY TO PRODUCTION.
-- Demonstrates a DATABASE-SIDE effect journal in the SAME transaction as
-- the existing service-role-only scoped authorization read.
-- This does NOT enforce arbitrary external MCP/HTTP effects or sign receipts.

create table public.gate_bounded_work_guarded_effects_DRAFT_v1 (
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  effect_id text not null check (length(effect_id) between 1 and 128),
  authority_issuer_id uuid not null,
  work_id text not null,
  principal text not null,
  actor text not null,
  protocol text not null,
  action_name text not null,
  resource text not null,
  accepted_sequence bigint not null check(accepted_sequence>=1),
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(project_id,effect_id)
);
alter table public.gate_bounded_work_guarded_effects_DRAFT_v1 enable row level security;
revoke all on public.gate_bounded_work_guarded_effects_DRAFT_v1
  from public,anon,authenticated,service_role;

-- IMPORTANT: This is an effect JOURNAL; its insert is the only protected mutation.
-- A database-side business mutation would need to live inside this same RPC.
-- An external tool call after the RPC remains subject to a revocation-to-effect race.
create function public.gate_record_bounded_work_guarded_effect_DRAFT_v1(
  p_project_id uuid,
  p_authority_issuer_id uuid,
  p_work_id text,
  p_principal text,
  p_actor text,
  p_protocol text,
  p_name text,
  p_resource text,
  p_effect_id text
)
returns table(applied boolean, accepted_sequence bigint)
language plpgsql volatile security definer set search_path = ''
as $gate$
declare
  v_decision record;
  v_rows bigint;
  v_prior public.gate_bounded_work_guarded_effects_DRAFT_v1%rowtype;
begin
  if p_effect_id is null or pg_catalog.length(p_effect_id) not between 1 and 128 or
     p_effect_id <> pg_catalog.btrim(p_effect_id) or
     p_effect_id ~ '[[:cntrl:]]' then
    raise exception 'invalid_guarded_effect_id';
  end if;

  -- Reader takes FOR SHARE on PROJECT, ISSUER, and WORK, held until this RPC
  -- commits. This protects the journal write against concurrent revocation.
  select v.* into v_decision
    from public.gate_verify_bounded_work_effect_v1(
      p_project_id,p_authority_issuer_id,p_work_id,p_principal,p_actor,
      p_protocol,p_name,p_resource
    ) v;
  if v_decision.decision is distinct from 'ALLOW' or
     v_decision.authority is distinct from 'VALID' then
    raise exception 'guarded_effect_denied';
  end if;

  -- Guard against clock drift / a lease expiring after the read's wall-clock
  -- sampling. Reject rather than relying on an ALLOW captured before expiry.
  if v_decision.checkpoint_not_after <= pg_catalog.clock_timestamp() then
    raise exception 'guarded_effect_checkpoint_expired';
  end if;
  insert into public.gate_bounded_work_guarded_effects_DRAFT_v1 (
    project_id,effect_id,authority_issuer_id,work_id,principal,actor,
    protocol,action_name,resource,accepted_sequence
  ) values (
    p_project_id,p_effect_id,p_authority_issuer_id,p_work_id,p_principal,p_actor,
    p_protocol,p_name,p_resource,v_decision.accepted_sequence
  ) on conflict(project_id,effect_id) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows=0 then
    select * into v_prior
      from public.gate_bounded_work_guarded_effects_DRAFT_v1 e
      where e.project_id=p_project_id and e.effect_id=p_effect_id;
    if not found or
       v_prior.authority_issuer_id is distinct from p_authority_issuer_id or
       v_prior.work_id is distinct from p_work_id or
       v_prior.principal is distinct from p_principal or
       v_prior.actor is distinct from p_actor or
       v_prior.protocol is distinct from p_protocol or
       v_prior.action_name is distinct from p_name or
       v_prior.resource is distinct from p_resource then
      raise exception 'guarded_effect_id_binding_conflict';
    end if;
  end if;
  return query select (v_rows=1),v_decision.accepted_sequence::bigint;
end;
$gate$;

revoke all on function public.gate_record_bounded_work_guarded_effect_DRAFT_v1(
 uuid,uuid,text,text,text,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.gate_record_bounded_work_guarded_effect_DRAFT_v1(
 uuid,uuid,text,text,text,text,text,text,text
) to service_role;
