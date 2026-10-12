
create or replace function public.gate_authority_snapshot_v1(p_project_id uuid)
returns table(
  snapshot_at timestamptz,
  source text,
  is_primary boolean,
  authority_edges jsonb,
  issuer_trust_states jsonb
)
language sql stable security invoker set search_path=''
as $gate$
  with edges as materialized (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'edge_id',e.edge_id,
          'issuer',e.issuer,
          'subject',e.subject,
          'status',e.status,
          'sequence',e.sequence,
          'updated_at',e.updated_at,
          'valid_until',e.valid_until,
          'revoked_at',e.revoked_at,
          'reason',e.reason,
          'authority_issuer_id',e.authority_issuer_id
        ) order by e.edge_id
      ),'[]'::jsonb
    ) as items
    from public.gate_live_edges e where e.project_id=p_project_id
  ), issuers as materialized (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',s.id,
          'status',s.status,
          'trust_reason',s.trust_reason
        ) order by s.id
      ),'[]'::jsonb
    ) as items
    from public.gate_issuer_trust_states(p_project_id) s
  )
  select
    pg_catalog.statement_timestamp(),
    case when pg_catalog.pg_is_in_recovery() then 'postgres-replica-unverified' else 'canonical-primary' end::text,
    not pg_catalog.pg_is_in_recovery(),
    edges.items,
    issuers.items
  from edges cross join issuers;
$gate$;
revoke all on function public.gate_authority_snapshot_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.gate_authority_snapshot_v1(uuid) to service_role;
;
