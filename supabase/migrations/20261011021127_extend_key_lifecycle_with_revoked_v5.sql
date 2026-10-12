
alter table public.gate_source_canary_scenario_keys
  drop constraint if exists gate_source_canary_scenario_keys_status_check;

alter table public.gate_source_canary_scenario_keys
  add constraint gate_source_canary_scenario_keys_status_check
  check (status in ('active','standby','retired','revoked'));

comment on column public.gate_source_canary_scenario_keys.status is
  'standby=no artifact trust; active=trusted within valid_from; retired=historical signatures allowed only within lifecycle window; revoked=immediate distrust.';
;
