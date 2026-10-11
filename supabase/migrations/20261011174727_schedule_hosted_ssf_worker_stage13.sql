
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'gate-ssf-managed-worker-v1'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end
$$;

select cron.schedule(
  'gate-ssf-managed-worker-v1',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-ssf-connectors/internal/run',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-gate-worker-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'gate_ssf_worker_secret_v1')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $cron$
);
;
