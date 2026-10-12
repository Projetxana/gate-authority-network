
alter table public.gate_source_canary_scenario_keys
  add column if not exists valid_from timestamptz,
  add column if not exists valid_until timestamptz;

update public.gate_source_canary_scenario_keys
set valid_from = coalesce(valid_from, updated_at, now())
where status = 'active';

comment on column public.gate_source_canary_scenario_keys.valid_from is
  'Earliest artifact iat accepted for this key in the scenario.';
comment on column public.gate_source_canary_scenario_keys.valid_until is
  'Latest artifact iat accepted for this key in the scenario; null while active/open.';
;
