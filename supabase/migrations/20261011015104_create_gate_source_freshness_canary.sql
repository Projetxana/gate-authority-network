
create table if not exists public.gate_source_canary_scenarios (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  principal text not null default 'user:canary',
  actor text not null default 'agent:C@company-c',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours')
);

create table if not exists public.gate_source_canary_sources (
  scenario_id uuid not null references public.gate_source_canary_scenarios(id) on delete cascade,
  source_id text not null,
  issuer_seq bigint not null check (issuer_seq >= 0),
  accepted_seq bigint not null check (accepted_seq >= 0),
  checkpoint_at timestamptz not null,
  checkpoint_not_after timestamptz not null,
  method text not null default 'issuer-sequence-checkpoint-canary',
  primary key (scenario_id, source_id)
);

create table if not exists public.gate_source_canary_edges (
  scenario_id uuid not null references public.gate_source_canary_scenarios(id) on delete cascade,
  edge_id text not null,
  issuer text not null,
  subject text not null,
  status text not null check (status in ('ACTIVE','REVOKED','UNKNOWN')),
  sequence bigint not null check (sequence >= 1),
  source_id text not null,
  valid_until timestamptz not null,
  revoked_at timestamptz,
  primary key (scenario_id, edge_id),
  foreign key (scenario_id, source_id)
    references public.gate_source_canary_sources(scenario_id, source_id)
    on delete cascade
);

create index if not exists gate_source_canary_scenarios_expires_idx
  on public.gate_source_canary_scenarios(expires_at);

alter table public.gate_source_canary_scenarios enable row level security;
alter table public.gate_source_canary_sources enable row level security;
alter table public.gate_source_canary_edges enable row level security;

comment on table public.gate_source_canary_scenarios is
  'Synthetic isolated GATE v8 canary scenarios. No production authority data.';
comment on table public.gate_source_canary_sources is
  'Issuer-plane sequence/checkpoint state for the GATE v8 source-freshness canary.';
comment on table public.gate_source_canary_edges is
  'GATE-plane mirrored authority graph for the GATE v8 source-freshness canary.';
;
