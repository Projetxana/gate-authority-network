
create table if not exists public.gate_authority_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  adapter text not null check (adapter ~ '^[a-z0-9_-]{2,40}$'),
  source_type text not null check (char_length(source_type) between 2 and 80),
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'active'
    check (status in ('active','paused','error','revoked')),
  external_issuer text null
    check (external_issuer is null or char_length(external_issuer) between 1 and 500),
  delivery_method text null
    check (delivery_method is null or char_length(delivery_method) between 1 and 120),
  adapter_resource_id uuid not null,
  poll_interval_seconds integer null
    check (poll_interval_seconds is null or poll_interval_seconds between 10 and 86400),
  stale_after_seconds integer not null default 180
    check (stale_after_seconds between 30 and 86400),
  provenance jsonb not null default '{}'::jsonb,
  last_poll_at timestamptz null,
  last_success_at timestamptz null,
  last_event_at timestamptz null,
  last_error_at timestamptz null,
  last_error text null
    check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, adapter, adapter_resource_id)
);

comment on table public.gate_authority_sources is
'Project-scoped registry of external authority sources understood by GATE. Stores non-secret source identity, transport, operational freshness and provenance metadata; adapter credentials remain in Vault or adapter-specific secret storage.';

alter table public.gate_authority_sources enable row level security;

revoke all on table public.gate_authority_sources from anon, authenticated;
grant select, insert, update, delete on table public.gate_authority_sources to service_role;

create index if not exists gate_authority_sources_project_status_idx
  on public.gate_authority_sources (project_id, status, updated_at desc);

create index if not exists gate_authority_sources_project_adapter_idx
  on public.gate_authority_sources (project_id, adapter, created_at desc);

create or replace function public.gate_sync_ssf_authority_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_success timestamptz;
begin
  if tg_op = 'DELETE' then
    update public.gate_authority_sources
       set status = 'revoked',
           updated_at = now()
     where project_id = old.project_id
       and adapter = 'ssf'
       and adapter_resource_id = old.id;
    return old;
  end if;

  v_last_success :=
    case
      when new.last_poll_at is not null and new.last_error is null
        then new.last_poll_at
      else null
    end;

  insert into public.gate_authority_sources (
    id,
    project_id,
    adapter,
    source_type,
    name,
    status,
    external_issuer,
    delivery_method,
    adapter_resource_id,
    poll_interval_seconds,
    stale_after_seconds,
    provenance,
    last_poll_at,
    last_success_at,
    last_event_at,
    last_error_at,
    last_error,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.project_id,
    'ssf',
    'ssf_transmitter',
    new.name,
    new.status,
    new.transmitter_issuer,
    new.delivery_method,
    new.id,
    60,
    180,
    jsonb_build_object(
      'transmitterIssuer', new.transmitter_issuer,
      'metadataUrl', new.metadata_url,
      'streamId', new.stream_id,
      'audience', new.stream_audience,
      'edgeId', new.edge_id,
      'mappingMode', new.mapping_mode,
      'requireSubject', new.require_subject
    ),
    new.last_poll_at,
    v_last_success,
    new.last_event_at,
    new.last_error_at,
    new.last_error,
    new.created_at,
    new.updated_at
  )
  on conflict (project_id, adapter, adapter_resource_id)
  do update set
    name = excluded.name,
    status = excluded.status,
    external_issuer = excluded.external_issuer,
    delivery_method = excluded.delivery_method,
    poll_interval_seconds = excluded.poll_interval_seconds,
    stale_after_seconds = excluded.stale_after_seconds,
    provenance = excluded.provenance,
    last_poll_at = excluded.last_poll_at,
    last_success_at =
      coalesce(excluded.last_success_at, gate_authority_sources.last_success_at),
    last_event_at = excluded.last_event_at,
    last_error_at = excluded.last_error_at,
    last_error = excluded.last_error,
    updated_at = excluded.updated_at;

  return new;
end
$$;

revoke all on function public.gate_sync_ssf_authority_source() from public, anon, authenticated;

drop trigger if exists gate_ssf_authority_source_sync
  on public.gate_ssf_connectors;

create trigger gate_ssf_authority_source_sync
after insert or update or delete
on public.gate_ssf_connectors
for each row
execute function public.gate_sync_ssf_authority_source();

insert into public.gate_authority_sources (
  id,
  project_id,
  adapter,
  source_type,
  name,
  status,
  external_issuer,
  delivery_method,
  adapter_resource_id,
  poll_interval_seconds,
  stale_after_seconds,
  provenance,
  last_poll_at,
  last_success_at,
  last_event_at,
  last_error_at,
  last_error,
  created_at,
  updated_at
)
select
  c.id,
  c.project_id,
  'ssf',
  'ssf_transmitter',
  c.name,
  c.status,
  c.transmitter_issuer,
  c.delivery_method,
  c.id,
  60,
  180,
  jsonb_build_object(
    'transmitterIssuer', c.transmitter_issuer,
    'metadataUrl', c.metadata_url,
    'streamId', c.stream_id,
    'audience', c.stream_audience,
    'edgeId', c.edge_id,
    'mappingMode', c.mapping_mode,
    'requireSubject', c.require_subject
  ),
  c.last_poll_at,
  case when c.last_poll_at is not null and c.last_error is null then c.last_poll_at else null end,
  c.last_event_at,
  c.last_error_at,
  c.last_error,
  c.created_at,
  c.updated_at
from public.gate_ssf_connectors c
on conflict (project_id, adapter, adapter_resource_id)
do update set
  name = excluded.name,
  status = excluded.status,
  external_issuer = excluded.external_issuer,
  delivery_method = excluded.delivery_method,
  provenance = excluded.provenance,
  last_poll_at = excluded.last_poll_at,
  last_success_at = coalesce(excluded.last_success_at, gate_authority_sources.last_success_at),
  last_event_at = excluded.last_event_at,
  last_error_at = excluded.last_error_at,
  last_error = excluded.last_error,
  updated_at = excluded.updated_at;
;
