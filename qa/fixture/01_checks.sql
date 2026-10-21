\set ON_ERROR_STOP on
-- All tests against isolated fixture, no real signed JWS or effect ALLOW.
do $check$
declare
 a uuid:='00000000-0000-4000-8000-000000000001';
 i uuid:='00000000-0000-4000-8000-000000000011';
 k jsonb:='{"kid":"kid1","kty":"EC","crv":"P-256","alg":"ES256","x":"test","y":"test"}'::jsonb;
 d text:=repeat('a',64);
 x record;
 msg text;
begin
 if pg_catalog.has_table_privilege('anon','public.gate_bounded_work_state_v2','select') then raise exception 'anon unexpectedly allowed read'; end if;
 if pg_catalog.has_table_privilege('authenticated','public.gate_bounded_work_replay_v2','select') then raise exception 'authenticated unexpectedly allowed read'; end if;
 if pg_catalog.has_function_privilege('anon', 'public.gate_admit_bounded_work_v2(uuid,uuid,text,text,jsonb,text,text,text,bigint,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,text)', 'execute') then raise exception 'anon unexpectedly allowed RPC'; end if;
 if not pg_catalog.has_function_privilege('service_role', 'public.gate_admit_bounded_work_v2(uuid,uuid,text,text,jsonb,text,text,text,bigint,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,text)', 'execute') then raise exception 'service_role RPC missing'; end if;

 select * into x from public.gate_admit_bounded_work_v2(a,i,'urn:test:issuer','kid1',k,'work-A',
 'event1','cp1',1,'ACTIVE','user:1','agent:1',now()+interval '5 minutes',now(),now(),now()+interval '20 seconds','[]'::jsonb,'[]'::jsonb,d,d);
 if x.accepted_sequence<>1 or x.accepted_status<>'ACTIVE' then raise exception 'seq1 mismatch'; end if;

 begin
  perform * from public.gate_admit_bounded_work_v2(a,i,'urn:test:issuer','kid1',k,'work-A',
  'event1b','cp1b',1,'ACTIVE','user:1','agent:1',now()+interval '5 minutes',now(),now(),now()+interval '20 seconds','[]'::jsonb,'[]'::jsonb,d,d);
  raise exception 'expected_replay_failure_missing';
 exception when others then
  get stacked diagnostics msg=message_text;
  if msg<>'bounded_work_sequence_gap_or_replay' then raise exception 'unexpected replay failure: %',msg; end if;
 end;

 begin
  perform * from public.gate_admit_bounded_work_v2(a,i,'urn:test:issuer','kid1',k,'work-A',
  'eventGap','cpGap',3,'ACTIVE','user:1','agent:1',now()+interval '5 minutes',now(),now(),now()+interval '20 seconds','[]'::jsonb,'[]'::jsonb,d,d);
  raise exception 'expected_gap_failure_missing';
 exception when others then
  get stacked diagnostics msg=message_text;
  if msg<>'bounded_work_sequence_gap_or_replay' then raise exception 'unexpected gap failure: %',msg; end if;
 end;

 select * into x from public.gate_admit_bounded_work_v2(a,i,'urn:test:issuer','kid1',k,'work-A',
 'event2','cp2',2,'REVOKED','user:1','agent:1',now(),now(),now(),now()+interval '20 seconds','[]'::jsonb,'[]'::jsonb,d,d);
 if x.accepted_sequence<>2 or x.accepted_status<>'REVOKED' then raise exception 'revoke mismatch'; end if;
 begin
  perform * from public.gate_admit_bounded_work_v2(a,i,'urn:test:issuer','kid1',k,'work-A',
  'event3','cp3',3,'ACTIVE','user:1','agent:1',now()+interval '5 minutes',now(),now(),now()+interval '20 seconds','[]'::jsonb,'[]'::jsonb,d,d);
  raise exception 'expected_terminal_failure_missing';
 exception when others then
  get stacked diagnostics msg=message_text;
  if msg<>'bounded_work_revocation_is_terminal' then raise exception 'unexpected terminal failure: %',msg; end if;
 end;

 -- Cross-work JTI must roll back the update to the candidate work state.
 begin
  perform * from public.gate_admit_bounded_work_v2(a,i,'urn:test:issuer','kid1',k,'work-B',
  'event1','cp-new',1,'ACTIVE','user:1','agent:1',now()+interval '5 minutes',now(),now(),now()+interval '20 seconds','[]'::jsonb,'[]'::jsonb,d,d);
  raise exception 'expected_jti_conflict_missing';
 exception when unique_violation then null;
 end;
 if exists(select 1 from public.gate_bounded_work_state_v2 where work_id='work-B') then raise exception 'rollback failed on duplicate JTI'; end if;

 -- Cannot use project A issuer with project B.
 begin
  perform * from public.gate_admit_bounded_work_v2('00000000-0000-4000-8000-000000000002',i,'urn:test:issuer','kid1',k,'work-C',
  'eventCross','cpCross',1,'ACTIVE','user:1','agent:1',now()+interval '5 minutes',now(),now(),now()+interval '20 seconds','[]'::jsonb,'[]'::jsonb,d,d);
  raise exception 'expected_cross_project_failure_missing';
 exception when others then
  get stacked diagnostics msg=message_text;
  if msg<>'bounded_work_issuer_or_project_not_trusted' then raise exception 'cross project got: %',msg; end if;
 end;

 -- Cannot admit a swapped trusted JWK, even if kid matches.
 begin
  perform * from public.gate_admit_bounded_work_v2(a,i,'urn:test:issuer','kid1',jsonb_set(k,'{x}','"swapped"'),'work-C',
  'eventSwap','cpSwap',1,'ACTIVE','user:1','agent:1',now()+interval '5 minutes',now(),now(),now()+interval '20 seconds','[]'::jsonb,'[]'::jsonb,d,d);
  raise exception 'expected_jwk_swap_failure_missing';
 exception when others then
  get stacked diagnostics msg=message_text;
  if msg<>'bounded_work_issuer_or_project_not_trusted' then raise exception 'key swap got: %',msg; end if;
 end;

 -- Unknown signed permission constraints must not be silently discarded.
 begin
  perform * from public.gate_admit_bounded_work_v2(a,i,'urn:test:issuer','kid1',k,'work-D',
  'eventLimits','cpLimits',1,'ACTIVE','user:1','agent:1',now()+interval '5 minutes',now(),now(),now()+interval '20 seconds',
  '[{"protocol":"mcp","name":"tools/call","resource":"doc:1","max_amount":500}]'::jsonb,'[]'::jsonb,d,d);
  raise exception 'expected_unknown_permission_constraint_failure_missing';
 exception when others then
  get stacked diagnostics msg=message_text;
  if msg<>'bounded_work_unsupported_signed_constraints' then raise exception 'bad permission handling: %',msg; end if;
 end;

 -- A direct issuer cannot sign an unrelated third-party delegation.
 begin
  perform * from public.gate_admit_bounded_work_v2(a,i,'urn:test:issuer','kid1',k,'work-E',
  'eventIndirect','cpIndirect',1,'ACTIVE','user:1','agent:1',now()+interval '5 minutes',now(),now(),now()+interval '20 seconds',
  '[]'::jsonb,'[{"edgeId":"e1","issuer":"user:other","subject":"agent:1","status":"ACTIVE","validUntil":"2030-01-01T00:00:00Z"}]'::jsonb,d,d);
  raise exception 'expected_third_party_delegation_failure_missing';
 exception when others then
  get stacked diagnostics msg=message_text;
  if msg<>'bounded_work_unsupported_signed_constraints' then raise exception 'bad third party handling: %',msg; end if;
 end;

 raise notice 'PASS: ACL, sequence, revocation, replay rollback, tenant/key isolation, unsupported constraints';
end;
$check$;
