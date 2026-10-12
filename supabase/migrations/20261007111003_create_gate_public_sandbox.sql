
create table public.gate_sandbox_edges (
  project_id uuid not null references public.gate_projects(id) on delete cascade,
  edge_id text not null,
  issuer text not null,
  subject text not null,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','REVOKED','UNKNOWN')),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  reason text,
  primary key (project_id, edge_id)
);

create index gate_sandbox_edges_issuer_idx
  on public.gate_sandbox_edges(project_id, issuer);

alter table public.gate_sandbox_edges enable row level security;

create policy gate_sandbox_edges_no_client_access
  on public.gate_sandbox_edges
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on public.gate_sandbox_edges from anon, authenticated;
grant select, insert, update, delete on public.gate_sandbox_edges to service_role;

create or replace function public.gate_seed_sandbox(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.gate_sandbox_edges (
    project_id, edge_id, issuer, subject, status, updated_at, revoked_at, reason
  )
  values
    (p_project_id, 'demo-human-a', 'user:demo', 'agent:A@company-a', 'ACTIVE', now(), null, null),
    (p_project_id, 'demo-a-c', 'agent:A@company-a', 'agent:C@company-c', 'ACTIVE', now(), null, null),
    (p_project_id, 'demo-human-b', 'user:demo', 'agent:B@company-b', 'ACTIVE', now(), null, null),
    (p_project_id, 'demo-b-c', 'agent:B@company-b', 'agent:C@company-c', 'ACTIVE', now(), null, null)
  on conflict (project_id, edge_id) do update
  set
    issuer = excluded.issuer,
    subject = excluded.subject,
    status = 'ACTIVE',
    updated_at = now(),
    revoked_at = null,
    reason = null;
end;
$$;

revoke all on function public.gate_seed_sandbox(uuid)
  from public, anon, authenticated;
grant execute on function public.gate_seed_sandbox(uuid)
  to service_role;
;
