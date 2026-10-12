
create table if not exists public.gate_beta_applications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  developer_role text not null check (developer_role in ('agent_builder','security_engineer','platform_engineer','founder','other')),
  integration_target text not null check (integration_target in ('mcp','sdk','http_api','research')),
  use_case text not null check (char_length(use_case) between 20 and 1200),
  status text not null default 'pending' check (status in ('pending','selected','invited','testing','completed','declined')),
  project_id uuid references public.gate_projects(id) on delete set null,
  consent_at timestamptz not null default now(),
  source text not null default 'early_access',
  ip_day_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gate_beta_email_length check(char_length(email) between 5 and 254),
  constraint gate_beta_email_normalized check(email=lower(trim(email))),
  constraint gate_beta_ip_hash_format check(ip_day_hash is null or ip_day_hash ~ '^[0-9a-f]{64}$')
);
create unique index if not exists gate_beta_email_uq on public.gate_beta_applications(email);
create index if not exists gate_beta_status_order on public.gate_beta_applications(status,created_at desc);

create table if not exists public.gate_beta_daily_rate (
  day date not null,
  ip_day_hash text not null check (ip_day_hash ~ '^[0-9a-f]{64}$'),
  attempts int not null default 0 check(attempts between 0 and 1000),
  primary key(day,ip_day_hash)
);

create table if not exists public.gate_beta_feedback (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  experience text not null check(experience in ('easy','mixed','blocked')),
  message text not null check(char_length(message) between 15 and 1200),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint gate_beta_feedback_email_length check(char_length(email) between 5 and 254)
);

alter table public.gate_beta_applications enable row level security;
alter table public.gate_beta_daily_rate enable row level security;
alter table public.gate_beta_feedback enable row level security;
revoke all on public.gate_beta_applications,public.gate_beta_daily_rate,public.gate_beta_feedback from public,anon,authenticated;
grant select,insert,update,delete on public.gate_beta_applications,public.gate_beta_daily_rate,public.gate_beta_feedback to service_role;

create or replace function public.gate_beta_apply(
  p_email text, p_developer_role text, p_integration_target text,
  p_use_case text, p_ip_day_hash text
) returns table(submitted boolean, duplicate boolean, limit_reached boolean)
language plpgsql security invoker set search_path=''
as $gate$
declare attempts_count int;
declare already boolean;
declare entered boolean := false;
declare today date := (now() at time zone 'utc')::date;
begin
  if p_email is null or p_email<>lower(trim(p_email)) or char_length(p_email) not between 5 and 254
     or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'
     or p_developer_role not in ('agent_builder','security_engineer','platform_engineer','founder','other')
     or p_integration_target not in ('mcp','sdk','http_api','research')
     or p_use_case is null or char_length(p_use_case) not between 20 and 1200
     or p_ip_day_hash is null or p_ip_day_hash !~ '^[0-9a-f]{64}$'
  then raise exception 'invalid_beta_submission'; end if;
  perform pg_catalog.pg_advisory_xact_lock(202610,2001);
  select coalesce((select r.attempts from public.gate_beta_daily_rate r
                   where r.day=today and r.ip_day_hash=p_ip_day_hash),0) into attempts_count;
  if attempts_count>=3 or (select coalesce(sum(r.attempts),0) from public.gate_beta_daily_rate r where r.day=today)>=120
  then return query select false,false,true;return;end if;
  insert into public.gate_beta_daily_rate(day,ip_day_hash,attempts)
  values(today,p_ip_day_hash,1)
  on conflict(day,ip_day_hash) do update set attempts=public.gate_beta_daily_rate.attempts+1;
  select exists(select 1 from public.gate_beta_applications a where a.email=p_email) into already;
  if not already then
    insert into public.gate_beta_applications(email,developer_role,integration_target,use_case,ip_day_hash)
    values(p_email,p_developer_role,p_integration_target,p_use_case,p_ip_day_hash)
    on conflict(email) do nothing;
    entered:=found;
  end if;
  return query select true,(already or not entered),false;
end;
$gate$;
revoke all on function public.gate_beta_apply(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.gate_beta_apply(text,text,text,text,text) to service_role;

create or replace function public.gate_beta_record_feedback(
 p_email text,p_experience text,p_message text,p_ip_day_hash text
) returns boolean
language plpgsql security invoker set search_path=''
as $gate$
declare today date := (now() at time zone 'utc')::date;
declare attempts_count int;
begin
 if p_email is null or p_email<>lower(trim(p_email)) or char_length(p_email) not between 5 and 254
 or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'
 or p_experience not in ('easy','mixed','blocked')
 or p_message is null or char_length(p_message) not between 15 and 1200
 or p_ip_day_hash is null or p_ip_day_hash !~ '^[0-9a-f]{64}$'
 then raise exception 'invalid_beta_feedback'; end if;
 perform pg_catalog.pg_advisory_xact_lock(202610,2001);
 select coalesce((select attempts from public.gate_beta_daily_rate where day=today and ip_day_hash=p_ip_day_hash),0) into attempts_count;
 if attempts_count>=3 then return false;end if;
 insert into public.gate_beta_daily_rate(day,ip_day_hash,attempts)
 values(today,p_ip_day_hash,1)
 on conflict(day,ip_day_hash) do update set attempts=public.gate_beta_daily_rate.attempts+1;
 if not exists(select 1 from public.gate_beta_applications where email=p_email)
 then return false;end if;
 insert into public.gate_beta_feedback(email,experience,message)
 values(p_email,p_experience,p_message);
 return true;
end;$gate$;
revoke all on function public.gate_beta_record_feedback(text,text,text,text) from public,anon,authenticated;
grant execute on function public.gate_beta_record_feedback(text,text,text,text) to service_role;

create or replace view public.gate_beta_funnel with (security_invoker = true) as
select count(*)::int as applications,
  count(*) filter(where status='pending')::int as pending,
  count(*) filter(where status='selected')::int as selected,
  count(*) filter(where status='invited')::int as invited,
  count(*) filter(where status='testing')::int as testing,
  count(*) filter(where status='completed')::int as completed,
  count(*) filter(where status='declined')::int as declined,
  (select count(*)::int from public.gate_beta_feedback) as feedback_submissions,
  count(*) filter(where project_id is not null)::int as linked_projects
from public.gate_beta_applications;
revoke all on public.gate_beta_funnel from public,anon,authenticated;
grant select on public.gate_beta_funnel to service_role;
;
