
alter table public.gate_source_canary_sources
  add column if not exists checkpoint_seq bigint;

update public.gate_source_canary_sources
set checkpoint_seq = issuer_seq
where checkpoint_seq is null;

alter table public.gate_source_canary_sources
  alter column checkpoint_seq set not null;

alter table public.gate_source_canary_sources
  add constraint gate_source_canary_checkpoint_seq_nonnegative
  check (checkpoint_seq >= 0);

comment on column public.gate_source_canary_sources.issuer_seq is
  'Authoritative sequence currently held by the synthetic issuer plane.';
comment on column public.gate_source_canary_sources.checkpoint_seq is
  'Last issuer sequence checkpoint observed by the GATE plane.';
comment on column public.gate_source_canary_sources.accepted_seq is
  'Last authority event sequence applied to the GATE graph.';
;
