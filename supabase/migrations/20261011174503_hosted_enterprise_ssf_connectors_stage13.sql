
create table if not exists public.gate_ssf_connectors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'active' check (status in ('active','paused','error','revoked')),
  transmitter_issuer text not null check (char_length(transmitter_issuer) between 8 and 300),
  metadata_url text not null check (metadata_url like 'https://%'),
  jwks_uri text not null check (jwks_uri like 'https://%'),
  configuration_endpoint text not null check (configuration_endpoint like 'https://%'),
  delivery_method text not null default 'urn:ietf:rfc:8936' check (delivery_method = 'urn:ietf:rfc:8936'),
  stream_id text not null check (char_length(stream_id) between 1 and 240),
  stream_audience text not null check (char_length(stream_audience) between 1 and 500),
  poll_endpoint text not null check (poll_endpoint like 'https://%'),
  events_requested jsonb not null default '["https://schemas.openid.net/secevent/caep/event-type/session-revoked"]'::jsonb,
  require_subject boolean not null default true,
  mapping_mode text not null check (mapping_mode in ('subject','stream')),
  subject_hash text null check (subject_hash is null or subject_hash ~ '^[0-9a-f]{64}$'),
  edge_id text not null check (char_length(edge_id) between 1 and 200),
  issuer_principal text not null check (char_length(issuer_principal) between 1 and 240),
  subject_principal text not null check (char_length(subject_principal) between 1 and 240),
  access_token_secret_id uuid not null,
  gate_api_key_id uuid not null references public.gate_api_keys(id) on delete restrict,
  gate_api_key_secret_id uuid not null,
  bridge_private_jwk_secret_id uuid not null,
  bridge_issuer_id uuid not null references public.gate_authority_issuers(id) on delete restrict,
  bridge_issuer text not null,
  bridge_key_id text not null,
  last_poll_at timestamptz null,
  last_event_at timestamptz null,
  last_error_at timestamptz null,
  last_error text null check (last_error is null or char_length(last_error) <= 500),
  lease_until timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name),
  unique (project_id, stream_id)
);

comment on table public.gate_ssf_connectors is
'Hosted GATE SSF receiver connectors. Access tokens, connector API keys, and bridge private keys are stored only in Supabase Vault; this table stores Vault UUID references and non-secret connector metadata.';

create index if not exists gate_ssf_connectors_due_idx
  on public.gate_ssf_connectors (status, lease_until, last_poll_at)
  where status = 'active';

create index if not exists gate_ssf_connectors_project_idx
  on public.gate_ssf_connectors (project_id, created_at desc);

alter table public.gate_ssf_connectors enable row level security;

create table if not exists public.gate_ssf_connector_events (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references public.gate_ssf_connectors(id) on delete cascade,
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  jti text not null check (char_length(jti) between 1 and 240),
  event_type text not null check (char_length(event_type) between 1 and 300),
  signing_alg text not null check (signing_alg in ('RS256','ES256')),
  signing_kid text not null check (char_length(signing_kid) between 1 and 240),
  subject_present boolean not null default false,
  canonical_status text null check (canonical_status is null or canonical_status in ('REVOKED','UNKNOWN')),
  canonical_sequence bigint null check (canonical_sequence is null or canonical_sequence >= 1),
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  unique (connector_id, jti)
);

comment on table public.gate_ssf_connector_events is
'Privacy-minimized hosted SSF receipt log. It stores no access token, SET body, principal payload, or subject identifier value.';

create index if not exists gate_ssf_connector_events_project_idx
  on public.gate_ssf_connector_events (project_id, received_at desc);

alter table public.gate_ssf_connector_events enable row level security;

create or replace function public.gate_vault_store_secret(
  p_secret text,
  p_name text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_id uuid;
begin
  if p_secret is null or char_length(p_secret) < 1 then
    raise exception 'secret_required';
  end if;
  select vault.create_secret(p_secret, p_name, p_description) into v_id;
  return v_id;
end
$$;

create or replace function public.gate_vault_read_secret(p_secret_id uuid)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where id = p_secret_id
$$;

create or replace function public.gate_vault_delete_secret(p_secret_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  delete from vault.secrets where id = p_secret_id;
end
$$;

revoke all on function public.gate_vault_store_secret(text,text,text) from public, anon, authenticated;
revoke all on function public.gate_vault_read_secret(uuid) from public, anon, authenticated;
revoke all on function public.gate_vault_delete_secret(uuid) from public, anon, authenticated;
grant execute on function public.gate_vault_store_secret(text,text,text) to service_role;
grant execute on function public.gate_vault_read_secret(uuid) to service_role;
grant execute on function public.gate_vault_delete_secret(uuid) to service_role;

create or replace function public.gate_ssf_claim_due_connectors(p_limit integer default 10)
returns setof public.gate_ssf_connectors
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select c.id
    from public.gate_ssf_connectors c
    where c.status = 'active'
      and (c.lease_until is null or c.lease_until < now())
      and (c.last_poll_at is null or c.last_poll_at < now() - interval '45 seconds')
    order by c.last_poll_at asc nulls first, c.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,10), 50))
  )
  update public.gate_ssf_connectors c
  set lease_until = now() + interval '55 seconds',
      updated_at = now()
  from picked
  where c.id = picked.id
  returning c.*;
end
$$;

revoke all on function public.gate_ssf_claim_due_connectors(integer) from public, anon, authenticated;
grant execute on function public.gate_ssf_claim_due_connectors(integer) to service_role;
;
