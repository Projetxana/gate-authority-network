create or replace function public.gate_reject_billing_subscription_project_relink()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.project_id is distinct from new.project_id then
    raise exception 'billing_subscription_project_relink_forbidden'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all
  on function public.gate_reject_billing_subscription_project_relink()
  from public, anon, authenticated;

grant execute
  on function public.gate_reject_billing_subscription_project_relink()
  to service_role;

drop trigger if exists gate_billing_subscription_project_binding_guard
  on public.gate_billing_subscriptions;

create trigger gate_billing_subscription_project_binding_guard
before update of project_id
on public.gate_billing_subscriptions
for each row
execute function public.gate_reject_billing_subscription_project_relink();

drop trigger if exists gate_qa_billing_subscription_project_binding_guard
  on public.gate_qa_billing_subscriptions;

create trigger gate_qa_billing_subscription_project_binding_guard
before update of project_id
on public.gate_qa_billing_subscriptions
for each row
execute function public.gate_reject_billing_subscription_project_relink();

create or replace function public.gate_reject_billing_watermark_project_relink()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.project_id is not null
     and new.project_id is distinct from old.project_id then
    raise exception 'billing_watermark_project_relink_forbidden'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all
  on function public.gate_reject_billing_watermark_project_relink()
  from public, anon, authenticated;

grant execute
  on function public.gate_reject_billing_watermark_project_relink()
  to service_role;

drop trigger if exists gate_billing_watermark_project_binding_guard
  on public.gate_billing_event_watermarks;

create trigger gate_billing_watermark_project_binding_guard
before update of project_id
on public.gate_billing_event_watermarks
for each row
execute function public.gate_reject_billing_watermark_project_relink();

drop trigger if exists gate_qa_billing_watermark_project_binding_guard
  on public.gate_qa_billing_event_watermarks;

create trigger gate_qa_billing_watermark_project_binding_guard
before update of project_id
on public.gate_qa_billing_event_watermarks
for each row
execute function public.gate_reject_billing_watermark_project_relink();
