
revoke all on function public.gate_authenticate_api_key_v2(text) from public,anon,authenticated;
grant execute on function public.gate_authenticate_api_key_v2(text) to service_role;
revoke all on function public.gate_project_entitlements(uuid) from public,anon,authenticated;
grant execute on function public.gate_project_entitlements(uuid) to service_role;
revoke all on function public.gate_project_usage_month(uuid) from public,anon,authenticated;
grant execute on function public.gate_project_usage_month(uuid) to service_role;
;
