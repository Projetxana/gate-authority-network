-- Stage 16:
-- Remove historical SSF worker schedules that predate the portable
-- environment-configured worker marker.
--
-- A live portable worker is preserved because its command contains:
--   /* gate-portable-ssf-worker-v1 */

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'gate-ssf-managed-worker-v1'
      and command not like '%gate-portable-ssf-worker-v1%'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end
$$;
