
alter view public.gate_verified_effects_daily set (security_invoker = true);
alter view public.gate_verified_effects_summary set (security_invoker = true);

create index if not exists gate_verified_effect_events_api_key_idx
  on public.gate_verified_effect_events (api_key_id)
  where api_key_id is not null;
;
