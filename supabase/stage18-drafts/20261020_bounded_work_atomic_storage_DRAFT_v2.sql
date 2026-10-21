-- GATE Stage 18 / Bounded Work — V2 REVIEW DRAFT. NOT PRODUCTION DEPLOYABLE.
-- Run ONLY in isolated PostgreSQL QA, after existing host schema is provisioned.
-- This SQL does NOT verify digital signatures; a separately audited, privileged
-- ingress MUST verify original JWS, issuer, audience, project, principal, actor,
-- work, action bounds, event/checkpoint signatures and source freshness.
-- Only a DIRECT, LOCAL (non-federated) issuer supported in v2.

create table public.gate_bounded_work_state_v2 (
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  authority_issuer_id uuid not null references public.gate_authority_issuers(id) on delete restrict,
  work_kind text not null default 'oauth-bounded-work' check (work_kind='oauth-bounded-work'),
  work_id text not null check(length(work_id) between 1 and 256 and work_id = btrim(work_id)),
  issuer text not null,
  principal text not null,
  actor text not null,
  status text not null check(status in ('ACTIVE','REVOKED')),
  accepted_seq bigint not null check (accepted_seq>=1),
  checkpoint_seq bigint not null check(checkpoint_seq=accepted_seq),
  checkpoint_not_after timestamptz not null,
  valid_until timestamptz not null,
  permissions jsonb not null check (jsonb_typeof(permissions)='array'),
  delegations jsonb not null check (jsonb_typeof(delegations)='array'),
  signing_kid text not null,
  signing_public_jwk jsonb not null,
  event_jti text not null,
  checkpoint_jti text not null,
  event_digest text not null,
  checkpoint_digest text not null,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(project_id,authority_issuer_id,work_kind,work_id)
);

create table public.gate_bounded_work_replay_v2 (
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  authority_issuer_id uuid not null references public.gate_authority_issuers(id) on delete restrict,
  jti text not null check(length(jti) between 1 and 256),
  artifact_type text not null check(artifact_type in ('event','checkpoint')),
  work_kind text not null check(work_kind='oauth-bounded-work'),
  work_id text not null,
  sequence bigint not null check(sequence>=1),
  received_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(project_id,authority_issuer_id,jti),
  foreign key(project_id,authority_issuer_id,work_kind,work_id)
    references public.gate_bounded_work_state_v2(project_id,authority_issuer_id,work_kind,work_id)
);
create index gate_bounded_work_replay_work_v2_idx on public.gate_bounded_work_replay_v2
  (project_id,authority_issuer_id,work_kind,work_id,sequence desc);

alter table public.gate_bounded_work_state_v2 enable row level security;
alter table public.gate_bounded_work_replay_v2 enable row level security;
revoke all on public.gate_bounded_work_state_v2 from PUBLIC,anon,authenticated,service_role;
revoke all on public.gate_bounded_work_replay_v2 from PUBLIC,anon,authenticated,service_role;

-- This function is deliberately an internal SQL proof-of-design. Its typed
-- parameters are NOT proof of signed evidence. No public/hosted caller may
-- use it to ALLOW an effect. The exact registered JWK is checked under row lock
-- to block concurrent trust swaps or issuer/project revocations.
create function public.gate_admit_bounded_work_v2(
  p_project_id uuid,
  p_authority_issuer_id uuid,
  p_issuer text,
  p_signing_kid text,
  p_expected_public_jwk jsonb,
  p_work_id text,
  p_event_jti text,
  p_checkpoint_jti text,
  p_sequence bigint,
  p_status text,
  p_principal text,
  p_actor text,
  p_valid_until timestamptz,
  p_event_issued_at timestamptz,
  p_checkpoint_issued_at timestamptz,
  p_checkpoint_not_after timestamptz,
  p_permissions jsonb,
  p_delegations jsonb,
  p_event_digest text,
  p_checkpoint_digest text
)
returns table(accepted_sequence bigint,accepted_status text)
language plpgsql security definer set search_path = ''
as $gate$
declare
  v_last_seq bigint;
  v_last_status text;
  v_last_principal text;
  v_last_actor text;
  v_trusted_issuer text;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_project_id is null or p_authority_issuer_id is null or
     p_issuer is null or pg_catalog.length(p_issuer) not between 1 and 256 or
     p_signing_kid is null or pg_catalog.length(p_signing_kid) not between 1 and 256 or
     p_expected_public_jwk is null or pg_catalog.jsonb_typeof(p_expected_public_jwk)<>'object' or
     p_work_id is null or pg_catalog.length(p_work_id) not between 1 and 256 or
     p_work_id <> pg_catalog.btrim(p_work_id) or
     p_event_jti is null or pg_catalog.length(p_event_jti) not between 1 and 256 or
     p_checkpoint_jti is null or pg_catalog.length(p_checkpoint_jti) not between 1 and 256 or
     p_event_jti = p_checkpoint_jti or
     p_status is null or p_status not in ('ACTIVE','REVOKED') or
     p_sequence is null or p_sequence < 1 or
     p_principal is null or p_principal = '' or
     p_actor is null or p_actor = '' or p_principal = p_actor or
     p_valid_until is null or p_event_issued_at is null or
     p_checkpoint_issued_at is null or p_checkpoint_not_after is null or
     p_permissions is null or pg_catalog.jsonb_typeof(p_permissions) <> 'array' or
     p_delegations is null or pg_catalog.jsonb_typeof(p_delegations) <> 'array' or
     p_event_digest is null or p_event_digest !~ '^[0-9a-f]{64}$' or
     p_checkpoint_digest is null or p_checkpoint_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_bounded_work_admission_input';
  end if;
  if pg_catalog.jsonb_array_length(p_permissions) > 128 or
     pg_catalog.jsonb_array_length(p_delegations) > 128 then
    raise exception 'bounded_work_payload_too_large';
  end if;
  if p_event_issued_at > v_now + interval '5 seconds' or
     p_event_issued_at < v_now - interval '10 minutes' or
     p_checkpoint_issued_at < p_event_issued_at or
     p_checkpoint_issued_at > v_now + interval '5 seconds' or
     p_checkpoint_not_after <= v_now or
     p_checkpoint_not_after <= p_checkpoint_issued_at or
     p_checkpoint_not_after > p_checkpoint_issued_at + interval '30 seconds' then
    raise exception 'bounded_work_signed_evidence_time_invalid';
  end if;
  if p_status = 'ACTIVE' and p_valid_until <= v_now then
    raise exception 'bounded_work_grant_expired';
  end if;

  -- Fail closed on unsupported effect constraints, unexpected or duplicate
  -- delegations. This validates structure only; it does NOT authenticate JWS.
  if exists(select 1 from pg_catalog.jsonb_array_elements(p_permissions) as x(item)
            where pg_catalog.jsonb_typeof(x.item)<>'object') or
     exists(select 1 from pg_catalog.jsonb_array_elements(p_delegations) as x(item)
            where pg_catalog.jsonb_typeof(x.item)<>'object') then
    raise exception 'bounded_work_unsupported_signed_constraints';
  end if;
  if exists(
      select 1 from pg_catalog.jsonb_array_elements(p_permissions) as x(item)
      where (select count(*) from pg_catalog.jsonb_object_keys(x.item))<>3
        or not (x.item ? 'protocol' and x.item ? 'name' and x.item ? 'resource')
        or pg_catalog.jsonb_typeof(x.item->'protocol')<>'string'
        or pg_catalog.jsonb_typeof(x.item->'name')<>'string'
        or pg_catalog.jsonb_typeof(x.item->'resource')<>'string'
        or x.item->>'protocol' in ('','*') or x.item->>'name' in ('','*')
        or x.item->>'resource' in ('','*')
    ) or exists (
      select 1 from pg_catalog.jsonb_array_elements(p_delegations) as x(item)
      where (select count(*) from pg_catalog.jsonb_object_keys(x.item))<>5
        or not (x.item ? 'edgeId' and x.item ? 'issuer' and x.item ? 'subject'
                and x.item ? 'status' and x.item ? 'validUntil')
        or pg_catalog.jsonb_typeof(x.item->'edgeId')<>'string'
        or pg_catalog.jsonb_typeof(x.item->'issuer')<>'string'
        or pg_catalog.jsonb_typeof(x.item->'subject')<>'string'
        or pg_catalog.jsonb_typeof(x.item->'status')<>'string'
        or pg_catalog.jsonb_typeof(x.item->'validUntil')<>'string'
        or x.item->>'edgeId'=''
        or x.item->>'issuer'<>p_principal or x.item->>'subject'<>p_actor
        or x.item->>'status' not in ('ACTIVE','REVOKED','UNKNOWN')
    ) or exists (
      select 1 from (
        select x.item->>'edgeId' as edge_id
        from pg_catalog.jsonb_array_elements(p_delegations) as x(item)
        group by x.item->>'edgeId' having count(*)>1
      ) as duplicates
    ) then
    raise exception 'bounded_work_unsupported_signed_constraints';
  end if;

  -- LOCK project AND issuer trust rows; UPDATE to status, key or JWK has to
  -- wait for this transaction. A concurrent prior UPDATE is rechecked by the
  -- READ COMMITTED SELECT FOR SHARE. Federated issuers are unsupported v2.
  select i.issuer into v_trusted_issuer
  from public.gate_projects proj
  join public.gate_authority_issuers i on i.project_id=proj.id
  where proj.id=p_project_id and proj.status='active'
    and i.id=p_authority_issuer_id and i.project_id=p_project_id
    and i.status='active' and i.federation_export_id is null
    and i.issuer=p_issuer and i.alg='ES256' and i.key_id=p_signing_kid
    and i.public_jwk=p_expected_public_jwk
  for share of proj,i;
  if v_trusted_issuer is null then
    raise exception 'bounded_work_issuer_or_project_not_trusted';
  end if;

  -- SERIALIZE all admissions for this work, including first inserts (no row
  -- yet to SELECT FOR UPDATE). A hash collision only adds serialization.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_project_id::text || '|' || p_authority_issuer_id::text ||
    '|oauth-bounded-work|' || p_work_id, 0));
  -- A lease which was fresh BEFORE waiting on a concurrent transaction may
  -- be expired NOW. Re-read wall clock after locks, before every write.
  v_now := pg_catalog.clock_timestamp();
  if p_checkpoint_not_after<=v_now or
     (p_status='ACTIVE' and p_valid_until<=v_now) then
    raise exception 'bounded_work_evidence_expired_while_waiting';
  end if;

  select s.accepted_seq,s.status,s.principal,s.actor
  into v_last_seq,v_last_status,v_last_principal,v_last_actor
  from public.gate_bounded_work_state_v2 s
  where s.project_id=p_project_id and s.authority_issuer_id=p_authority_issuer_id
    and s.work_kind='oauth-bounded-work' and s.work_id=p_work_id
  for update;
  if p_sequence <> coalesce(v_last_seq,0)+1 then
    raise exception 'bounded_work_sequence_gap_or_replay';
  end if;
  if v_last_status='REVOKED' then
    raise exception 'bounded_work_revocation_is_terminal';
  end if;
  if v_last_seq is not null and (p_principal<>v_last_principal or p_actor<>v_last_actor) then
    raise exception 'bounded_work_principal_or_actor_changed';
  end if;

  insert into public.gate_bounded_work_state_v2 (
    project_id,authority_issuer_id,work_kind,work_id,issuer,principal,actor,
    status,accepted_seq,checkpoint_seq,checkpoint_not_after,valid_until,
    permissions,delegations,signing_kid,signing_public_jwk,event_jti,
    checkpoint_jti,event_digest,checkpoint_digest
  ) values (
    p_project_id,p_authority_issuer_id,'oauth-bounded-work',p_work_id,v_trusted_issuer,
    p_principal,p_actor,p_status,p_sequence,p_sequence,p_checkpoint_not_after,
    p_valid_until,p_permissions,p_delegations,p_signing_kid,p_expected_public_jwk,
    p_event_jti,p_checkpoint_jti,p_event_digest,p_checkpoint_digest
  ) on conflict(project_id,authority_issuer_id,work_kind,work_id) do update set
    status=excluded.status,accepted_seq=excluded.accepted_seq,
    checkpoint_seq=excluded.checkpoint_seq,
    checkpoint_not_after=excluded.checkpoint_not_after,
    valid_until=excluded.valid_until,permissions=excluded.permissions,
    delegations=excluded.delegations,signing_kid=excluded.signing_kid,
    signing_public_jwk=excluded.signing_public_jwk,event_jti=excluded.event_jti,
    checkpoint_jti=excluded.checkpoint_jti,event_digest=excluded.event_digest,
    checkpoint_digest=excluded.checkpoint_digest,updated_at=pg_catalog.clock_timestamp();

  -- Both replay IDs and the snapshot update commit or roll back together.
  insert into public.gate_bounded_work_replay_v2
    (project_id,authority_issuer_id,jti,artifact_type,work_kind,work_id,sequence)
  values
    (p_project_id,p_authority_issuer_id,p_event_jti,'event','oauth-bounded-work',p_work_id,p_sequence),
    (p_project_id,p_authority_issuer_id,p_checkpoint_jti,'checkpoint','oauth-bounded-work',p_work_id,p_sequence);
  return query select p_sequence,p_status;
end;
$gate$;

revoke all on function public.gate_admit_bounded_work_v2(
 uuid,uuid,text,text,jsonb,text,text,text,bigint,text,text,text,
 timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,text
) from PUBLIC,anon,authenticated;
grant execute on function public.gate_admit_bounded_work_v2(
 uuid,uuid,text,text,jsonb,text,text,text,bigint,text,text,text,
 timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,text
) to service_role;

-- No public reader or AUTHZ ALLOW API is created by this draft. Reads must
-- evaluate CURRENT trust/key state, lease expiry, status and effect bounds.
