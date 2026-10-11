
create index if not exists gate_ssf_connectors_gate_api_key_idx
  on public.gate_ssf_connectors (gate_api_key_id);

create index if not exists gate_ssf_connectors_bridge_issuer_idx
  on public.gate_ssf_connectors (bridge_issuer_id);
;
