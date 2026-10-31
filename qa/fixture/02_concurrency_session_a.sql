\set ON_ERROR_STOP on
begin;
-- Hold per-work lock to reliably cause Session B to wait.
select pg_advisory_xact_lock(hashtextextended('00000000-0000-4000-8000-000000000001|00000000-0000-4000-8000-000000000011|oauth-bounded-work|work-concurrent',0));
select 'WORK_LOCKED' as readiness;
select pg_sleep(2);
select * from public.gate_admit_bounded_work_v2(
'00000000-0000-4000-8000-000000000001',
'00000000-0000-4000-8000-000000000011',
'urn:test:issuer','kid1',
'{"kid":"kid1","kty":"EC","crv":"P-256","alg":"ES256","x":"test","y":"test"}'::jsonb,
'work-concurrent','eventConcurrentA','cpConcurrentA',1,'ACTIVE','user:1','agent:1',
now()+interval '5 minutes',now(),now(),now()+interval '20 seconds','[]'::jsonb,'[]'::jsonb,repeat('a',64),repeat('b',64));
commit;
