
create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'gate_ssf_worker_secret_v1'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'gate_ssf_worker_secret_v1',
      'Internal scheduler secret for hosted GATE SSF worker'
    );
  end if;
end
$$;

create or replace function public.gate_ssf_worker_secret_matches(p_secret text)
returns boolean
language sql
security definer
set search_path = public, vault
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'gate_ssf_worker_secret_v1'
      and decrypted_secret = p_secret
  )
$$;

revoke all on function public.gate_ssf_worker_secret_matches(text) from public, anon, authenticated;
grant execute on function public.gate_ssf_worker_secret_matches(text) to service_role;
;
