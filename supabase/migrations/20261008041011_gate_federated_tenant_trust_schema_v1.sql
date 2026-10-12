
create table if not exists public.gate_federation_exports (
  id uuid primary key default gen_random_uuid(),
  source_project_id uuid not null references public.gate_projects(id) on delete cascade,
  audience_project_id uuid not null references public.gate_projects(id) on delete cascade,
  source_issuer_id uuid not null references public.gate_authority_issuers(id) on delete restrict,
  status text not null default 'active' check(status in ('active','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gate_federation_export_cross_tenant_check check(source_project_id<>audience_project_id),
  constraint gate_federation_export_unique unique(source_project_id,audience_project_id,source_issuer_id)
);
create index if not exists gate_federation_exports_audience_idx on public.gate_federation_exports(audience_project_id,status);
create index if not exists gate_federation_exports_source_idx on public.gate_federation_exports(source_project_id,status);
alter table public.gate_federation_exports enable row level security;
revoke all on public.gate_federation_exports from PUBLIC,anon,authenticated;
grant select,insert,update,delete on public.gate_federation_exports to service_role;
alter table public.gate_authority_issuers
 add column if not exists federation_export_id uuid references public.gate_federation_exports(id) on delete restrict;
create index if not exists gate_federated_imports_export_idx
 on public.gate_authority_issuers(federation_export_id) where federation_export_id is not null;
create or replace function public.gate_issuer_trust_states(p_project_id uuid)
returns table(id uuid,status text,trust_reason text)
language sql stable security invoker set search_path=''
as $fn$
  select ai.id,
   case when ai.status<>'active' then 'revoked'
     when ai.federation_export_id is null then 'active'
     when fx.id is null or up.id is null or src.id is null then 'missing'
     when fx.status<>'active' or up.status<>'active' or src.status<>'active' then 'revoked'
     when fx.audience_project_id<>ai.project_id or fx.source_project_id<>up.project_id or fx.source_issuer_id<>up.id then 'missing'
     when ai.issuer is distinct from up.issuer or ai.key_id is distinct from up.key_id
       or ai.alg is distinct from up.alg or ai.public_jwk is distinct from up.public_jwk
       or ai.principal_patterns is distinct from up.principal_patterns or up.federation_export_id is not null then 'missing'
     else 'active' end::text,
   case when ai.status<>'active' then 'authority_issuer_revoked'
     when ai.federation_export_id is null then null
     when fx.id is null or up.id is null or src.id is null then 'federated_source_missing'
     when fx.status<>'active' then 'federated_export_revoked'
     when up.status<>'active' then 'federated_source_revoked'
     when src.status<>'active' then 'federated_source_disabled'
     when fx.audience_project_id<>ai.project_id or fx.source_project_id<>up.project_id or fx.source_issuer_id<>up.id then 'federated_binding_mismatch'
     when ai.issuer is distinct from up.issuer or ai.key_id is distinct from up.key_id
       or ai.alg is distinct from up.alg or ai.public_jwk is distinct from up.public_jwk
       or ai.principal_patterns is distinct from up.principal_patterns or up.federation_export_id is not null then 'federated_signing_material_changed'
     else null end::text
  from public.gate_authority_issuers ai
  left join public.gate_federation_exports fx on fx.id=ai.federation_export_id
  left join public.gate_authority_issuers up on up.id=fx.source_issuer_id
  left join public.gate_projects src on src.id=fx.source_project_id
  where ai.project_id=p_project_id;
$fn$;
revoke all on function public.gate_issuer_trust_states(uuid) from PUBLIC,anon,authenticated;
grant execute on function public.gate_issuer_trust_states(uuid) to service_role;
;
