-- Stage18 local isolated QA draft ONLY. Not deployed to Supabase.
-- The reader is service-role-only, project + work + exact action scoped.
-- An ALLOW here is a database verdict, NOT a hosted protected effect or receipt.
-- Its lease proves possession of a signed checkpoint, NOT independent live issuer state.

create function public.gate_verify_bounded_work_effect_v1(
  p_project_id uuid,
  p_authority_issuer_id uuid,
  p_work_id text,
  p_principal text,
  p_actor text,
  p_protocol text,
  p_name text,
  p_resource text
)
returns table (authority text, decision text, reason text, accepted_sequence bigint,
               checkpoint_not_after timestamptz)
language plpgsql volatile security definer set search_path = ''
as $gate$
declare
  v_work public.gate_bounded_work_state_v2%rowtype;
  v_now timestamptz;
  v_delegation jsonb;
  v_expires timestamptz;
  v_matching_path boolean := false;
begin
  if p_project_id is null or p_authority_issuer_id is null or
     p_work_id is null or pg_catalog.length(p_work_id) not between 1 and 256 or
     p_work_id <> pg_catalog.btrim(p_work_id) or
     p_principal is null or p_principal = '' or
     p_actor is null or p_actor = '' or p_principal=p_actor or
     p_protocol is null or p_protocol in ('','*') or
     p_name is null or p_name in ('','*') or
     p_resource is null or p_resource in ('','*') then
    return query select 'UNKNOWN'::text,'DENY'::text,'invalid_effect_request'::text,
                        null::bigint,null::timestamptz;
    return;
  end if;

  -- One locked consistency boundary. Key replacements, project withdrawal,
  -- issuer revocation and work revocation all serialize against this read.
  -- No federation in this restricted v1 profile.
  select w.* into v_work
  from public.gate_bounded_work_state_v2 w
  join public.gate_projects proj on proj.id=w.project_id
  join public.gate_authority_issuers issuer
    on issuer.id=w.authority_issuer_id and issuer.project_id=w.project_id
  where w.project_id=p_project_id
    and w.authority_issuer_id=p_authority_issuer_id
    and w.work_kind='oauth-bounded-work'
    and w.work_id=p_work_id
    and proj.status='active' and issuer.status='active'
    and issuer.federation_export_id is null
    and issuer.alg='ES256'
    and issuer.issuer=w.issuer
    and issuer.key_id=w.signing_kid
    and issuer.public_jwk=w.signing_public_jwk
  for share of w,proj,issuer;
  if not found then
    return query select 'UNKNOWN'::text,'DENY'::text,'work_or_issuer_trust_unavailable'::text,
                        null::bigint,null::timestamptz;
    return;
  end if;

  -- Clock MUST be sampled after lock acquisition to avoid using a lease that
  -- expired while a revocation or update held a competing lock.
  v_now:=pg_catalog.clock_timestamp();
  if v_work.principal <> p_principal or v_work.actor <> p_actor then
    return query select 'INVALID'::text,'DENY'::text,'work_binding_mismatch'::text,
                        v_work.accepted_seq,v_work.checkpoint_not_after;
    return;
  end if;
  if v_work.status='REVOKED' then
    return query select 'INVALID'::text,'DENY'::text,'governing_work_revoked'::text,
                        v_work.accepted_seq,v_work.checkpoint_not_after;
    return;
  end if;
  if v_work.status<>'ACTIVE' then
    return query select 'UNKNOWN'::text,'DENY'::text,'governing_work_unknown'::text,
                        v_work.accepted_seq,v_work.checkpoint_not_after;
    return;
  end if;
  if v_work.checkpoint_not_after<=v_now then
    return query select 'UNKNOWN'::text,'DENY'::text,'issuer_checkpoint_stale'::text,
                        v_work.accepted_seq,v_work.checkpoint_not_after;
    return;
  end if;
  if v_work.valid_until<=v_now then
    return query select 'INVALID'::text,'DENY'::text,'governing_work_expired'::text,
                        v_work.accepted_seq,v_work.checkpoint_not_after;
    return;
  end if;
  if not exists(
    select 1 from pg_catalog.jsonb_array_elements(v_work.permissions) perm(item)
    where perm.item->>'protocol'=p_protocol
      and perm.item->>'name'=p_name and perm.item->>'resource'=p_resource
  ) then
    return query select 'INVALID'::text,'DENY'::text,'effect_outside_signed_permissions'::text,
                        v_work.accepted_seq,v_work.checkpoint_not_after;
    return;
  end if;

  for v_delegation in
    select item from pg_catalog.jsonb_array_elements(v_work.delegations) entry(item)
  loop
    if v_delegation->>'issuer'=p_principal
       and v_delegation->>'subject'=p_actor
       and v_delegation->>'status'='ACTIVE'
       and pg_catalog.pg_input_is_valid(
         v_delegation->>'validUntil','timestamp with time zone') then
      v_expires := (v_delegation->>'validUntil')::timestamptz;
      if v_expires>v_now then
        v_matching_path:=true;
        exit;
      end if;
    end if;
  end loop;
  if not v_matching_path then
    return query select 'INVALID'::text,'DENY'::text,'no_active_scoped_delegation'::text,
                        v_work.accepted_seq,v_work.checkpoint_not_after;
    return;
  end if;
  return query select 'VALID'::text,'ALLOW'::text,'bounded_work_permission_verified'::text,
                      v_work.accepted_seq,v_work.checkpoint_not_after;
end;
$gate$;

revoke all on function public.gate_verify_bounded_work_effect_v1(
 uuid,uuid,text,text,text,text,text,text
) from PUBLIC,anon,authenticated;
grant execute on function public.gate_verify_bounded_work_effect_v1(
 uuid,uuid,text,text,text,text,text,text
) to service_role;
