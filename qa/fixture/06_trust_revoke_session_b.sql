\set ON_ERROR_STOP on
-- Must wait for concurrent issuer status update, then reject.
select * from public.gate_admit_bounded_work_v2(
'00000000-0000-4000-8000-000000000001',
'00000000-0000-4000-8000-000000000011',
'urn:test:issuer','kid1',
'{"kid":"kid1","kty":"EC","crv":"P-256","alg":"ES256","x":"test","y":"test"}'::jsonb,
'work-trust-revoked','eventTrustB','cpTrustB',1,'ACTIVE','user:1','agent:1',
now()+interval '5 minutes',now(),now(),now()+interval '20 seconds','[]'::jsonb,'[]'::jsonb,repeat('a',64),repeat('b',64));
