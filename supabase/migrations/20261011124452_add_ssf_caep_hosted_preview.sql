
create table if not exists public.gate_ssf_preview_scenarios (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  issuer text not null,
  audience text not null,
  public_jwk jsonb not null,
  subject_format text not null,
  subject_id text not null,
  principal text not null,
  actor text not null,
  edge_id text not null,
  edge_status text not null default 'ACTIVE'
    check (edge_status in ('ACTIVE','REVOKED','UNKNOWN')),
  source_seq bigint not null default 0 check (source_seq >= 0),
  last_event_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now()
);

create table if not exists public.gate_ssf_preview_events (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.gate_ssf_preview_scenarios(id) on delete cascade,
  jti text not null,
  event_type text not null,
  subject_format text not null,
  subject_id text not null,
  event_timestamp timestamptz not null,
  received_at timestamptz not null default now(),
  unique (scenario_id, jti)
);

alter table public.gate_ssf_preview_scenarios enable row level security;
alter table public.gate_ssf_preview_events enable row level security;

create index if not exists gate_ssf_preview_scenarios_expires_idx
  on public.gate_ssf_preview_scenarios (expires_at);

create index if not exists gate_ssf_preview_events_scenario_idx
  on public.gate_ssf_preview_events (scenario_id, received_at desc);
;
