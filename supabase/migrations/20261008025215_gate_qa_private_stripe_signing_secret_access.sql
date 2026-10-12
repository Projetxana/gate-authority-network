
create or replace function public.gate_qa_runtime_signing_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='stripe_qa_webhook_secret'
  order by created_at desc
  limit 1
$$;
revoke all on function public.gate_qa_runtime_signing_secret() from public, anon, authenticated;
grant execute on function public.gate_qa_runtime_signing_secret() to service_role;
;
