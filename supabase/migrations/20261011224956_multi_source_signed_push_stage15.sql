
alter table public.gate_authority_sources
  add column if not exists freshness_contract text not null default 'poll_interval'
    check (freshness_contract in ('poll_interval','event_driven','checkpoint'));

comment on column public.gate_authority_sources.freshness_contract is
'How operational ingestion freshness may be interpreted. poll_interval can become stale when expected polls stop; event_driven only reports observed activity unless an independent checkpoint/heartbeat contract exists; checkpoint is reserved for explicit issuer freshness artifacts.';

update public.gate_authority_sources
set freshness_contract = 'poll_interval'
where adapter = 'ssf'
  and freshness_contract is distinct from 'poll_interval';

create table if not exists public.gate_signed_authority_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'active'
    check (status in ('active','paused','error','revoked')),
  external_issuer text not null
    check (char_length(external_issuer) between 1 and 240),
  key_id text not null
    check (char_length(key_id) between 1 and 160),
  public_jwk jsonb not null,
  principal_patterns text[] not null
    check (cardinality(principal_patterns) between 1 and 50),
  gate_api_key_id uuid not null
    references public.gate_api_keys(id) on delete restrict,
  gate_api_key_secret_id uuid not null,
  canonical_issuer_id uuid not null
    references public.gate_authority_issuers(id) on delete restrict,
  last_event_at timestamptz null,
  last_success_at timestamptz null,
  last_error_at timestamptz null,
  last_error text null
    check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, external_issuer, key_id)
);

comment on table public.gate_signed_authority_sources is
'Hosted signed-push authority sources. External private signing keys never enter GATE; only public JWKs are stored. A dedicated internal GATE API key is stored in Vault for canonical forwarding.';

alter table public.gate_signed_authority_sources enable row level security;
revoke all on table public.gate_signed_authority_sources from anon, authenticated;
grant select, insert, update, delete on table public.gate_signed_authority_sources to service_role;

create index if not exists gate_signed_authority_sources_project_status_idx
  on public.gate_signed_authority_sources (project_id, status, created_at desc);

create index if not exists gate_signed_authority_sources_gate_api_key_idx
  on public.gate_signed_authority_sources (gate_api_key_id);

create index if not exists gate_signed_authority_sources_canonical_issuer_idx
  on public.gate_signed_authority_sources (canonical_issuer_id);

create table if not exists public.gate_signed_authority_source_events (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null
    references public.gate_signed_authority_sources(id) on delete cascade,
  project_id uuid not null
    references public.gate_projects(id) on delete cascade,
  jti text not null check (char_length(jti) between 1 and 200),
  edge_id text not null check (char_length(edge_id) between 1 and 200),
  status text not null check (status in ('ACTIVE','REVOKED','UNKNOWN')),
  sequence bigint not null check (sequence >= 1),
  signing_alg text not null check (signing_alg = 'ES256'),
  signing_kid text not null check (char_length(signing_kid) between 1 and 160),
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  unique (source_id, jti)
);

comment on table public.gate_signed_authority_source_events is
'Privacy-minimized receipt log for signed-push authority events. It stores no private key and no full signed token.';

alter table public.gate_signed_authority_source_events enable row level security;
revoke all on table public.gate_signed_authority_source_events from anon, authenticated;
grant select, insert, update, delete on table public.gate_signed_authority_source_events to service_role;

create index if not exists gate_signed_source_events_project_received_idx
  on public.gate_signed_authority_source_events (project_id, received_at desc);

create or replace function public.gate_sync_signed_authority_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.gate_authority_sources
       set status = 'revoked',
           updated_at = now()
     where project_id = old.project_id
       and adapter = 'signed_push'
       and adapter_resource_id = old.id;
    return old;
  end if;

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
    freshness_contract,
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
    'signed_push',
    'signed_authority_feed',
    new.name,
    new.status,
    new.external_issuer,
    'urn:gate:delivery:signed-push:v1',
    new.id,
    null,
    900,
    'event_driven',
    jsonb_build_object(
      'issuer', new.external_issuer,
      'keyId', new.key_id,
      'alg', 'ES256',
      'principalPatterns', to_jsonb(new.principal_patterns)
    ),
    null,
    new.last_success_at,
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
    freshness_contract = excluded.freshness_contract,
    provenance = excluded.provenance,
    last_success_at = excluded.last_success_at,
    last_event_at = excluded.last_event_at,
    last_error_at = excluded.last_error_at,
    last_error = excluded.last_error,
    updated_at = excluded.updated_at;

  return new;
end
$$;

revoke all on function public.gate_sync_signed_authority_source()
from public, anon, authenticated;

drop trigger if exists gate_signed_authority_source_sync
  on public.gate_signed_authority_sources;

create trigger gate_signed_authority_source_sync
after insert or update or delete
on public.gate_signed_authority_sources
for each row
execute function public.gate_sync_signed_authority_source();
;
