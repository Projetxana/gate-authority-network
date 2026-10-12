
create table if not exists public.gate_source_canary_keys (
  kid text primary key,
  issuer text not null,
  public_jwk jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.gate_source_canary_scenario_keys (
  scenario_id uuid not null references public.gate_source_canary_scenarios(id) on delete cascade,
  kid text not null references public.gate_source_canary_keys(kid),
  status text not null check (status in ('active','standby','retired')),
  updated_at timestamptz not null default now(),
  primary key (scenario_id,kid)
);

alter table public.gate_source_canary_keys enable row level security;
alter table public.gate_source_canary_scenario_keys enable row level security;

insert into public.gate_source_canary_keys(kid,issuer,public_jwk)
values
(
  'gate-source-canary-issuer-v1',
  'urn:gate:canary:source-issuer:v1',
  '{"kty":"EC","crv":"P-256","x":"VWv0uUUfAwFLSNAYWTSGkSdigKrWPSLjLKyjGnyEa_I","y":"GjCKoQRriyH9r7Uvs3RXTDfCfs60FvxruV-6tYCZ6UY","use":"sig","alg":"ES256","kid":"gate-source-canary-issuer-v1"}'::jsonb
),
(
  'gate-source-canary-issuer-v2',
  'urn:gate:canary:source-issuer:v1',
  '{"kty":"EC","crv":"P-256","x":"fKi5bPAnbaumePOHhZM5WJF29G8Z5o_980tKPRtlTao","y":"eIxXhh3CQBPL2VxkykNkOZAJnNyfl20u7W_h7RDQL4w","use":"sig","alg":"ES256","kid":"gate-source-canary-issuer-v2"}'::jsonb
)
on conflict (kid) do update set
  issuer=excluded.issuer,
  public_jwk=excluded.public_jwk;

comment on table public.gate_source_canary_scenario_keys is
  'Per-scenario signing-key lifecycle for isolated v4 key-rotation tests.';
;
