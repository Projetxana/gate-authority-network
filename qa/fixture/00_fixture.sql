\set ON_ERROR_STOP on
-- Isolated Postgres 17 container only. Never run this bootstrap against GATE.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table public.gate_projects(id uuid primary key,status text not null);
create table public.gate_authority_issuers(
  id uuid primary key, project_id uuid not null references public.gate_projects(id),
  issuer text not null, key_id text not null, alg text not null,
  public_jwk jsonb not null, status text not null,
  federation_export_id uuid
);
insert into public.gate_projects(id,status) values
('00000000-0000-4000-8000-000000000001','active'),
('00000000-0000-4000-8000-000000000002','active');
insert into public.gate_authority_issuers
 (id,project_id,issuer,key_id,alg,public_jwk,status) values
 ('00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000001',
  'urn:test:issuer', 'kid1','ES256',
  '{"kid":"kid1","kty":"EC","crv":"P-256","alg":"ES256","x":"test","y":"test"}'::jsonb,
  'active');
