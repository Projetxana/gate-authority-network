\set ON_ERROR_STOP on
do $check$
begin
 if (select count(*) from public.gate_bounded_work_state_v2 where work_id='work-concurrent')<>1 then
   raise exception 'expected exactly one concurrent work state';
 end if;
 if (select accepted_seq from public.gate_bounded_work_state_v2 where work_id='work-concurrent')<>1 then
   raise exception 'unexpected concurrent accepted sequence';
 end if;
 if (select count(*) from public.gate_bounded_work_replay_v2 where work_id='work-concurrent')<>2 then
   raise exception 'expected exactly two replay ledger artifacts';
 end if;
 raise notice 'PASS: exactly one concurrent seq1 committed';
end;$check$;
