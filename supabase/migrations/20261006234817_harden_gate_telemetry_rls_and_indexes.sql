
create index if not exists gate_verification_events_api_key_idx
  on public.gate_verification_events(api_key_id);

create policy gate_projects_no_client_access
  on public.gate_projects
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy gate_api_keys_no_client_access
  on public.gate_api_keys
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy gate_verification_events_no_client_access
  on public.gate_verification_events
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy gate_daily_usage_no_client_access
  on public.gate_daily_usage
  for all
  to anon, authenticated
  using (false)
  with check (false);
;
