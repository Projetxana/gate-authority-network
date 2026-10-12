
create or replace function public.gate_federation_export_create(
 p_source_project_id uuid,p_audience_project_id uuid,p_source_issuer_id uuid
) returns table(export_id uuid,export_status text)
language plpgsql security invoker set search_path='' as $f$
declare v_id uuid;
begin
 if p_source_project_id is null or p_audience_project_id is null
 or p_source_issuer_id is null or p_source_project_id=p_audience_project_id
 then raise exception 'invalid_federation_export_arguments'; end if;
 if not exists(select 1 from public.gate_projects where id=p_source_project_id and status='active')
 or not exists(select 1 from public.gate_projects where id=p_audience_project_id and status='active')
 then raise exception 'federation_project_unavailable'; end if;
 if not exists(select 1 from public.gate_authority_issuers
 where id=p_source_issuer_id and project_id=p_source_project_id
 and status='active' and federation_export_id is null)
 then raise exception 'local_source_issuer_not_active'; end if;
 insert into public.gate_federation_exports(source_project_id,audience_project_id,source_issuer_id)
 values(p_source_project_id,p_audience_project_id,p_source_issuer_id)
 returning id into v_id;
 return query select v_id,'active'::text;
end;$f$;
revoke all on function public.gate_federation_export_create(uuid,uuid,uuid) from PUBLIC,anon,authenticated;
grant execute on function public.gate_federation_export_create(uuid,uuid,uuid) to service_role;

create or replace function public.gate_federation_import(
 p_consumer_project_id uuid,p_export_id uuid
) returns table(imported_issuer_id uuid, imported_issuer text, imported_key_id text, source_project_id uuid)
language plpgsql security invoker set search_path='' as $f$
declare v_export record; v_issuer record;v_max bigint;v_used bigint;v_new uuid;
begin
 if p_consumer_project_id is null or p_export_id is null
 then raise exception 'invalid_federation_import_arguments';end if;
 perform pg_catalog.pg_advisory_xact_lock(420113,pg_catalog.hashtext(p_consumer_project_id::text));
 select fx.* into v_export from public.gate_federation_exports fx
 where fx.id=p_export_id and fx.audience_project_id=p_consumer_project_id and fx.status='active'
 for share;
 if not found then raise exception 'federation_export_not_available_for_consumer';end if;
 if not exists(select 1 from public.gate_projects where id=p_consumer_project_id and status='active')
 or not exists(select 1 from public.gate_projects where id=v_export.source_project_id and status='active')
 then raise exception 'federation_project_unavailable';end if;
 select ai.* into v_issuer from public.gate_authority_issuers ai
 where ai.id=v_export.source_issuer_id and ai.project_id=v_export.source_project_id
 and ai.status='active' and ai.federation_export_id is null for share;
 if not found then raise exception 'federation_upstream_issuer_not_active';end if;
 select pe.max_issuers into v_max from public.gate_projects pr
 join public.gate_plan_entitlements pe on pe.plan=pr.plan
 where pr.id=p_consumer_project_id;
 if v_max is null then raise exception 'federation_entitlements_missing';end if;
 select count(*) into v_used from public.gate_authority_issuers
 where project_id=p_consumer_project_id and status='active';
 if v_used>=v_max then raise exception 'issuer_limit_reached';end if;
 insert into public.gate_authority_issuers(
 project_id,issuer,key_id,alg,public_jwk,principal_patterns,status,federation_export_id
 ) values(
 p_consumer_project_id,v_issuer.issuer,v_issuer.key_id,v_issuer.alg,
 v_issuer.public_jwk,v_issuer.principal_patterns,'active',p_export_id
 ) returning id into v_new;
 return query select v_new,v_issuer.issuer,v_issuer.key_id,v_export.source_project_id;
end;$f$;
revoke all on function public.gate_federation_import(uuid,uuid) from PUBLIC,anon,authenticated;
grant execute on function public.gate_federation_import(uuid,uuid) to service_role;

create or replace function public.gate_federation_export_revoke(
 p_source_project_id uuid,p_export_id uuid
) returns table(export_id uuid,export_status text)
language plpgsql security invoker set search_path='' as $f$
declare v_id uuid;
begin
 update public.gate_federation_exports fx set status='revoked',updated_at=now()
 where fx.id=p_export_id and fx.source_project_id=p_source_project_id and fx.status='active'
 returning id into v_id;
 if v_id is null then raise exception 'active_federation_export_not_found';end if;
 return query select v_id,'revoked'::text;
end;$f$;
revoke all on function public.gate_federation_export_revoke(uuid,uuid) from PUBLIC,anon,authenticated;
grant execute on function public.gate_federation_export_revoke(uuid,uuid) to service_role;
;
