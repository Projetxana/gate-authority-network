
create table if not exists public.gate_source_canary_artifacts (
  scenario_id uuid not null references public.gate_source_canary_scenarios(id) on delete cascade,
  jti text not null,
  artifact_type text not null check (artifact_type in ('checkpoint','event')),
  source_id text not null,
  sequence bigint not null check (sequence >= 0),
  received_at timestamptz not null default now(),
  primary key (scenario_id,jti)
);

alter table public.gate_source_canary_artifacts enable row level security;

create index if not exists gate_source_canary_artifacts_scenario_received_idx
  on public.gate_source_canary_artifacts(scenario_id,received_at desc);

comment on table public.gate_source_canary_artifacts is
  'Replay log for cryptographically signed issuer checkpoints and authority events in the isolated GATE source-freshness canary.';
;
