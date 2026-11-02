\set ON_ERROR_STOP on
begin;
-- Simulate an issuer revocation holding the row update lock.
select status from public.gate_authority_issuers
 where id='00000000-0000-4000-8000-000000000011' for update;
select 'ISSUER_LOCKED' as readiness;
select pg_sleep(2);
update public.gate_authority_issuers set status='revoked'
 where id='00000000-0000-4000-8000-000000000011';
commit;
