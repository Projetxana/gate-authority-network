-- Stage 16:
-- Replace the historical project-specific SSF worker schedule with an
-- environment-configurable scheduler.
--
-- The historical migration remains unchanged because it reflects the actual
-- production migration history.

-- Applying this migration must not interrupt the existing worker.
-- The current schedule remains active until gate_configure_ssf_worker()
-- is explicitly called after the target Edge Functions are deployed.

create or replace function public.gate_configure_ssf_worker(
  p_functions_base_url text
)
returns bigint
language plpgsql
security definer
set search_path = public, vault, cron, net
as $function$
declare
  v_base text;
  v_target text;
  v_command text;
  v_job_id bigint;
begin
  v_base := regexp_replace(
    trim(p_functions_base_url),
    '/+$',
    ''
  );

  if v_base is null
     or v_base !~ '^https://[^[:space:]]+/functions/v1$'
  then
    raise exception 'invalid_functions_base_url';
  end if;

  if not exists (
    select 1
    from vault.secrets
    where name = 'gate_ssf_worker_secret_v1'
  ) then
    raise exception 'gate_ssf_worker_secret_missing';
  end if;

  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'gate-ssf-managed-worker-v1'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  v_target :=
    v_base || '/gate-ssf-connectors/internal/run';

  v_command := format(
    $sql$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-gate-worker-secret',
          (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'gate_ssf_worker_secret_v1'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      );
    $sql$,
    v_target
  );

  select cron.schedule(
    'gate-ssf-managed-worker-v1',
    '* * * * *',
    v_command
  )
  into v_job_id;

  return v_job_id;
end;
$function$;

revoke all
on function public.gate_configure_ssf_worker(text)
from public, anon, authenticated;

grant execute
on function public.gate_configure_ssf_worker(text)
to service_role;

comment on function public.gate_configure_ssf_worker(text) is
  'Configures the hosted SSF worker against the current environment functions base URL. Stage 16 removes project-specific runtime URLs from migration logic.';
