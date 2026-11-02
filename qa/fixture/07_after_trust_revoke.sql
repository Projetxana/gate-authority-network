\set ON_ERROR_STOP on
do $check$
begin
 if exists(select 1 from public.gate_bounded_work_state_v2 where work_id='work-trust-revoked') then
  raise exception 'issuer revoked but state admitted';
 end if;
 if exists(select 1 from public.gate_bounded_work_replay_v2 where work_id='work-trust-revoked') then
  raise exception 'issuer revoked but replay ledger mutated';
 end if;
 raise notice 'PASS: concurrent trust revocation blocks ingress';
end;$check$;
