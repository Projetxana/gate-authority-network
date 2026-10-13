alter table public.gate_billing_events
  add column if not exists stripe_created_at bigint,
  add column if not exists stripe_subscription_id text,
  add column if not exists state_applied boolean,
  add column if not exists ordering_reason text;

alter table public.gate_qa_billing_events
  add column if not exists stripe_created_at bigint,
  add column if not exists stripe_subscription_id text,
  add column if not exists state_applied boolean,
  add column if not exists ordering_reason text;

create index if not exists gate_billing_events_subscription_order_idx
  on public.gate_billing_events (
    stripe_subscription_id,
    stripe_created_at desc,
    processed_at desc
  )
  where stripe_subscription_id is not null
    and stripe_created_at is not null;

create index if not exists gate_qa_billing_events_subscription_order_idx
  on public.gate_qa_billing_events (
    stripe_subscription_id,
    stripe_created_at desc,
    processed_at desc
  )
  where stripe_subscription_id is not null
    and stripe_created_at is not null;

create table if not exists public.gate_billing_event_watermarks (
  stripe_subscription_id text primary key,
  stripe_created_at bigint not null check (stripe_created_at >= 0),
  safety_rank smallint not null default 0 check (safety_rank between 0 and 9),
  stripe_event_id text not null,
  event_type text not null,
  project_id uuid references public.gate_projects(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.gate_qa_billing_event_watermarks (
  stripe_subscription_id text primary key,
  stripe_created_at bigint not null check (stripe_created_at >= 0),
  safety_rank smallint not null default 0 check (safety_rank between 0 and 9),
  stripe_event_id text not null,
  event_type text not null,
  project_id uuid references public.gate_qa_billing_projects(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.gate_billing_event_watermarks enable row level security;
alter table public.gate_qa_billing_event_watermarks enable row level security;

revoke all
  on table public.gate_billing_event_watermarks,
           public.gate_qa_billing_event_watermarks
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.gate_billing_event_watermarks,
           public.gate_qa_billing_event_watermarks
  to service_role;

create or replace function public.gate_apply_billing_transition(
  p_stripe_event_id text,
  p_event_type text,
  p_payload_hash text,
  p_stripe_created_at bigint,
  p_stripe_subscription_id text,
  p_safety_rank smallint,
  p_project_id uuid,
  p_subscription_write_mode text,
  p_stripe_customer_id text,
  p_stripe_price_id text,
  p_subscription_plan text,
  p_subscription_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_effective_project_plan text
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_wm public.gate_billing_event_watermarks%rowtype;
begin
  if coalesce(p_stripe_event_id, '') = ''
     or coalesce(p_event_type, '') = ''
     or coalesce(p_payload_hash, '') = '' then
    raise exception 'billing_event_identity_required';
  end if;

  if coalesce(p_stripe_subscription_id, '') = '' then
    raise exception 'billing_subscription_required';
  end if;

  if p_stripe_created_at is null or p_stripe_created_at < 0 then
    raise exception 'billing_event_created_invalid';
  end if;

  if p_safety_rank is null or p_safety_rank < 0 or p_safety_rank > 9 then
    raise exception 'billing_safety_rank_invalid';
  end if;

  if p_subscription_write_mode not in ('none', 'upsert', 'update') then
    raise exception 'billing_write_mode_invalid';
  end if;

  if p_subscription_plan is not null
     and p_subscription_plan not in ('pro', 'scale') then
    raise exception 'billing_subscription_plan_invalid';
  end if;

  if p_effective_project_plan is not null
     and p_effective_project_plan not in ('free', 'pro', 'scale') then
    raise exception 'billing_effective_plan_invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('gate-billing:' || p_stripe_subscription_id, 0)
  );

  if exists (
    select 1
    from public.gate_billing_events
    where stripe_event_id = p_stripe_event_id
  ) then
    return jsonb_build_object(
      'applied', false,
      'reason', 'duplicate'
    );
  end if;

  select *
  into v_wm
  from public.gate_billing_event_watermarks
  where stripe_subscription_id = p_stripe_subscription_id
  for update;

  if found and (
    p_stripe_created_at < v_wm.stripe_created_at
    or (
      p_stripe_created_at = v_wm.stripe_created_at
      and p_safety_rank <= v_wm.safety_rank
    )
  ) then
    insert into public.gate_billing_events (
      stripe_event_id,
      event_type,
      livemode,
      project_id,
      payload_hash,
      stripe_created_at,
      stripe_subscription_id,
      state_applied,
      ordering_reason
    ) values (
      p_stripe_event_id,
      p_event_type,
      true,
      p_project_id,
      p_payload_hash,
      p_stripe_created_at,
      p_stripe_subscription_id,
      false,
      'stale_or_equal_order'
    );

    return jsonb_build_object(
      'applied', false,
      'reason', 'stale_or_equal_order'
    );
  end if;

  if p_project_id is not null and not exists (
    select 1
    from public.gate_projects
    where id = p_project_id
      and status = 'active'
      and is_internal = false
  ) then
    raise exception 'billing_project_invalid';
  end if;

  if p_subscription_write_mode = 'upsert' then
    if p_project_id is null
       or p_subscription_plan is null
       or p_subscription_status is null then
      raise exception 'billing_upsert_fields_required';
    end if;

    insert into public.gate_billing_subscriptions (
      project_id,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      plan,
      status,
      current_period_end,
      cancel_at_period_end
    ) values (
      p_project_id,
      p_stripe_customer_id,
      p_stripe_subscription_id,
      p_stripe_price_id,
      p_subscription_plan,
      p_subscription_status,
      p_current_period_end,
      coalesce(p_cancel_at_period_end, false)
    )
    on conflict (stripe_subscription_id) do update set
      project_id = excluded.project_id,
      stripe_customer_id = coalesce(
        excluded.stripe_customer_id,
        gate_billing_subscriptions.stripe_customer_id
      ),
      stripe_price_id = coalesce(
        excluded.stripe_price_id,
        gate_billing_subscriptions.stripe_price_id
      ),
      plan = excluded.plan,
      status = excluded.status,
      current_period_end = coalesce(
        excluded.current_period_end,
        gate_billing_subscriptions.current_period_end
      ),
      cancel_at_period_end = excluded.cancel_at_period_end,
      updated_at = now();

  elsif p_subscription_write_mode = 'update' then
    update public.gate_billing_subscriptions
    set
      stripe_customer_id = coalesce(
        p_stripe_customer_id,
        stripe_customer_id
      ),
      stripe_price_id = coalesce(
        p_stripe_price_id,
        stripe_price_id
      ),
      plan = coalesce(
        p_subscription_plan,
        plan
      ),
      status = coalesce(
        p_subscription_status,
        status
      ),
      current_period_end = coalesce(
        p_current_period_end,
        current_period_end
      ),
      cancel_at_period_end = coalesce(
        p_cancel_at_period_end,
        cancel_at_period_end
      ),
      updated_at = now()
    where stripe_subscription_id = p_stripe_subscription_id;
  end if;

  if p_effective_project_plan is not null
     and p_project_id is not null then
    update public.gate_projects
    set plan = p_effective_project_plan
    where id = p_project_id;
  end if;

  insert into public.gate_billing_event_watermarks (
    stripe_subscription_id,
    stripe_created_at,
    safety_rank,
    stripe_event_id,
    event_type,
    project_id,
    updated_at
  ) values (
    p_stripe_subscription_id,
    p_stripe_created_at,
    p_safety_rank,
    p_stripe_event_id,
    p_event_type,
    p_project_id,
    now()
  )
  on conflict (stripe_subscription_id) do update set
    stripe_created_at = excluded.stripe_created_at,
    safety_rank = excluded.safety_rank,
    stripe_event_id = excluded.stripe_event_id,
    event_type = excluded.event_type,
    project_id = coalesce(
      excluded.project_id,
      gate_billing_event_watermarks.project_id
    ),
    updated_at = now();

  insert into public.gate_billing_events (
    stripe_event_id,
    event_type,
    livemode,
    project_id,
    payload_hash,
    stripe_created_at,
    stripe_subscription_id,
    state_applied,
    ordering_reason
  ) values (
    p_stripe_event_id,
    p_event_type,
    true,
    p_project_id,
    p_payload_hash,
    p_stripe_created_at,
    p_stripe_subscription_id,
    true,
    'applied'
  );

  return jsonb_build_object(
    'applied', true,
    'reason', 'applied'
  );
end;
$$;

revoke all
  on function public.gate_apply_billing_transition(
    text,text,text,bigint,text,smallint,uuid,text,text,text,text,text,
    timestamptz,boolean,text
  )
  from public, anon, authenticated;

grant execute
  on function public.gate_apply_billing_transition(
    text,text,text,bigint,text,smallint,uuid,text,text,text,text,text,
    timestamptz,boolean,text
  )
  to service_role;

create or replace function public.gate_qa_apply_billing_transition(
  p_stripe_event_id text,
  p_event_type text,
  p_payload_hash text,
  p_stripe_created_at bigint,
  p_stripe_subscription_id text,
  p_safety_rank smallint,
  p_project_id uuid,
  p_subscription_write_mode text,
  p_stripe_customer_id text,
  p_stripe_price_id text,
  p_subscription_plan text,
  p_subscription_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_effective_project_plan text
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_wm public.gate_qa_billing_event_watermarks%rowtype;
begin
  if coalesce(p_stripe_event_id, '') = ''
     or coalesce(p_event_type, '') = ''
     or coalesce(p_payload_hash, '') = '' then
    raise exception 'billing_event_identity_required';
  end if;

  if coalesce(p_stripe_subscription_id, '') = '' then
    raise exception 'billing_subscription_required';
  end if;

  if p_stripe_created_at is null or p_stripe_created_at < 0 then
    raise exception 'billing_event_created_invalid';
  end if;

  if p_safety_rank is null or p_safety_rank < 0 or p_safety_rank > 9 then
    raise exception 'billing_safety_rank_invalid';
  end if;

  if p_subscription_write_mode not in ('none', 'upsert', 'update') then
    raise exception 'billing_write_mode_invalid';
  end if;

  if p_subscription_plan is not null
     and p_subscription_plan not in ('pro', 'scale') then
    raise exception 'billing_subscription_plan_invalid';
  end if;

  if p_effective_project_plan is not null
     and p_effective_project_plan not in ('free', 'pro', 'scale') then
    raise exception 'billing_effective_plan_invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('gate-qa-billing:' || p_stripe_subscription_id, 0)
  );

  if exists (
    select 1
    from public.gate_qa_billing_events
    where stripe_event_id = p_stripe_event_id
  ) then
    return jsonb_build_object(
      'applied', false,
      'reason', 'duplicate'
    );
  end if;

  select *
  into v_wm
  from public.gate_qa_billing_event_watermarks
  where stripe_subscription_id = p_stripe_subscription_id
  for update;

  if found and (
    p_stripe_created_at < v_wm.stripe_created_at
    or (
      p_stripe_created_at = v_wm.stripe_created_at
      and p_safety_rank <= v_wm.safety_rank
    )
  ) then
    insert into public.gate_qa_billing_events (
      stripe_event_id,
      event_type,
      livemode,
      project_id,
      payload_hash,
      stripe_created_at,
      stripe_subscription_id,
      state_applied,
      ordering_reason
    ) values (
      p_stripe_event_id,
      p_event_type,
      false,
      p_project_id,
      p_payload_hash,
      p_stripe_created_at,
      p_stripe_subscription_id,
      false,
      'stale_or_equal_order'
    );

    return jsonb_build_object(
      'applied', false,
      'reason', 'stale_or_equal_order'
    );
  end if;

  if p_project_id is not null and not exists (
    select 1
    from public.gate_qa_billing_projects
    where id = p_project_id
  ) then
    raise exception 'billing_project_invalid';
  end if;

  if p_subscription_write_mode = 'upsert' then
    if p_project_id is null
       or p_subscription_plan is null
       or p_subscription_status is null then
      raise exception 'billing_upsert_fields_required';
    end if;

    insert into public.gate_qa_billing_subscriptions (
      project_id,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      plan,
      status,
      current_period_end,
      cancel_at_period_end
    ) values (
      p_project_id,
      p_stripe_customer_id,
      p_stripe_subscription_id,
      p_stripe_price_id,
      p_subscription_plan,
      p_subscription_status,
      p_current_period_end,
      coalesce(p_cancel_at_period_end, false)
    )
    on conflict (stripe_subscription_id) do update set
      project_id = excluded.project_id,
      stripe_customer_id = coalesce(
        excluded.stripe_customer_id,
        gate_qa_billing_subscriptions.stripe_customer_id
      ),
      stripe_price_id = coalesce(
        excluded.stripe_price_id,
        gate_qa_billing_subscriptions.stripe_price_id
      ),
      plan = excluded.plan,
      status = excluded.status,
      current_period_end = coalesce(
        excluded.current_period_end,
        gate_qa_billing_subscriptions.current_period_end
      ),
      cancel_at_period_end = excluded.cancel_at_period_end,
      updated_at = now();

  elsif p_subscription_write_mode = 'update' then
    update public.gate_qa_billing_subscriptions
    set
      stripe_customer_id = coalesce(
        p_stripe_customer_id,
        stripe_customer_id
      ),
      stripe_price_id = coalesce(
        p_stripe_price_id,
        stripe_price_id
      ),
      plan = coalesce(
        p_subscription_plan,
        plan
      ),
      status = coalesce(
        p_subscription_status,
        status
      ),
      current_period_end = coalesce(
        p_current_period_end,
        current_period_end
      ),
      cancel_at_period_end = coalesce(
        p_cancel_at_period_end,
        cancel_at_period_end
      ),
      updated_at = now()
    where stripe_subscription_id = p_stripe_subscription_id;
  end if;

  if p_effective_project_plan is not null
     and p_project_id is not null then
    update public.gate_qa_billing_projects
    set
      plan = p_effective_project_plan,
      updated_at = now()
    where id = p_project_id;
  end if;

  insert into public.gate_qa_billing_event_watermarks (
    stripe_subscription_id,
    stripe_created_at,
    safety_rank,
    stripe_event_id,
    event_type,
    project_id,
    updated_at
  ) values (
    p_stripe_subscription_id,
    p_stripe_created_at,
    p_safety_rank,
    p_stripe_event_id,
    p_event_type,
    p_project_id,
    now()
  )
  on conflict (stripe_subscription_id) do update set
    stripe_created_at = excluded.stripe_created_at,
    safety_rank = excluded.safety_rank,
    stripe_event_id = excluded.stripe_event_id,
    event_type = excluded.event_type,
    project_id = coalesce(
      excluded.project_id,
      gate_qa_billing_event_watermarks.project_id
    ),
    updated_at = now();

  insert into public.gate_qa_billing_events (
    stripe_event_id,
    event_type,
    livemode,
    project_id,
    payload_hash,
    stripe_created_at,
    stripe_subscription_id,
    state_applied,
    ordering_reason
  ) values (
    p_stripe_event_id,
    p_event_type,
    false,
    p_project_id,
    p_payload_hash,
    p_stripe_created_at,
    p_stripe_subscription_id,
    true,
    'applied'
  );

  return jsonb_build_object(
    'applied', true,
    'reason', 'applied'
  );
end;
$$;

revoke all
  on function public.gate_qa_apply_billing_transition(
    text,text,text,bigint,text,smallint,uuid,text,text,text,text,text,
    timestamptz,boolean,text
  )
  from public, anon, authenticated;

grant execute
  on function public.gate_qa_apply_billing_transition(
    text,text,text,bigint,text,smallint,uuid,text,text,text,text,text,
    timestamptz,boolean,text
  )
  to service_role;

create index if not exists gate_billing_event_watermarks_project_idx
  on public.gate_billing_event_watermarks (project_id)
  where project_id is not null;

create index if not exists gate_qa_billing_event_watermarks_project_idx
  on public.gate_qa_billing_event_watermarks (project_id)
  where project_id is not null;
