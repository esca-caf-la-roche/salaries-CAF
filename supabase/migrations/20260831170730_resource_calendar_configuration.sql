alter table public.calendars
  add column is_resource boolean not null default false;

alter table public.employees
  add column resource_calendar_id uuid unique references public.calendars(id) on delete set null;

do $$
begin
  if exists (
    select 1
    from public.employees
    where nullif(trim(email), '') is not null
    group by lower(trim(email))
    having count(*) > 1
  ) then
    raise exception 'Impossible de garantir un e-mail unique : des salariés existants partagent la même adresse normalisée';
  end if;
end
$$;

create unique index employees_email_unique_idx
  on public.employees (lower(trim(email)))
  where nullif(trim(email), '') is not null;

alter table public.employees
  add constraint employees_selected_resource_requires_email
  check (resource_calendar_id is null or not active or nullif(trim(email), '') is not null);

alter table public.calendar_events
  add column source_google_calendar_id text,
  add column coefficient_rule_id uuid references public.coefficient_rules(id) on delete set null;

create index calendars_resource_enabled_idx
  on public.calendars(connection_id, enabled)
  where is_resource;

create index calendar_events_rule_id_idx
  on public.calendar_events(coefficient_rule_id)
  where coefficient_rule_id is not null;

create or replace function public.internal_configure_resources(
  p_connection_id uuid,
  p_updates jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  resource_id uuid;
  enabled_value boolean;
  login_email text;
  previous_user_id uuid;
  next_user_id uuid;
begin
  if jsonb_typeof(p_updates) <> 'array' then
    raise exception 'Liste de ressources invalide';
  end if;

  for item in select value from jsonb_array_elements(p_updates)
  loop
    enabled_value := coalesce((item ->> 'enabled')::boolean, false);
    login_email := nullif(lower(trim(item ->> 'loginEmail')), '');
    if enabled_value and (login_email is null or login_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
      raise exception 'Un e-mail valide est requis pour chaque ressource suivie';
    end if;

    select c.id into resource_id
    from public.employees e
    join public.calendars c on c.id = e.resource_calendar_id
    where e.id = (item ->> 'id')::uuid
      and c.connection_id = p_connection_id
      and c.is_resource;

    if resource_id is null then
      raise exception 'Ressource Google inconnue';
    end if;

    select user_id into previous_user_id
    from public.employees
    where id = (item ->> 'id')::uuid;
    next_user_id := nullif(item ->> 'userId', '')::uuid;

    update public.employees
    set active = enabled_value,
        email = login_email,
        user_id = next_user_id
    where id = (item ->> 'id')::uuid;

    update public.calendars
    set enabled = enabled_value
    where id = resource_id;

    if next_user_id is not null then
      update public.profiles
      set active = true
      where id = next_user_id and role = 'employee';
    end if;

    if previous_user_id is not null and previous_user_id is distinct from next_user_id then
      update public.profiles p
      set active = false
      where p.id = previous_user_id
        and p.role = 'employee'
        and not exists (
          select 1 from public.employees active_employee
          where active_employee.user_id = previous_user_id and active_employee.active
        );
    end if;
  end loop;
end;
$$;

revoke all on function public.internal_configure_resources(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.internal_configure_resources(uuid,jsonb) to service_role;

drop policy calendars_employee_select on public.calendars;
create policy calendars_employee_select on public.calendars for select to authenticated
using (exists (
  select 1
  from public.employees e
  where e.resource_calendar_id = calendars.id
    and e.user_id = (select auth.uid())
    and e.active
));

drop policy calendar_events_employee_select on public.calendar_events;
create policy calendar_events_employee_select on public.calendar_events for select to authenticated
using (exists (
  select 1
  from public.employees e
  where e.resource_calendar_id = calendar_events.calendar_id
    and e.user_id = (select auth.uid())
    and e.active
));

create policy coefficient_rules_employee_select_used on public.coefficient_rules for select to authenticated
using (active and exists (
  select 1
  from public.calendar_events ce
  join public.employees e on e.resource_calendar_id = ce.calendar_id
  where lower(trim(ce.source_google_calendar_id)) = lower(trim(coefficient_rules.google_calendar_id))
    and e.user_id = (select auth.uid())
    and e.active
));

drop view public.monthly_hours;
create view public.monthly_hours
with (security_invoker = true)
as
with event_month_slices as (
  select
    e.id as employee_id,
    e.display_name as employee_name,
    cr.label as calendar_name,
    ce.id as event_id,
    month_slice.local_month_start::date as month_start,
    extract(epoch from (
      least(
        ce.ends_at,
        (month_slice.local_month_start + interval '1 month') at time zone 'Europe/Paris'
      )
      - greatest(
        ce.starts_at,
        month_slice.local_month_start at time zone 'Europe/Paris'
      )
    )) / 3600.0 as elapsed_hours,
    cr.coefficient
  from public.calendar_events ce
  join public.calendars resource_calendar on resource_calendar.id = ce.calendar_id
  join public.employees e on e.resource_calendar_id = resource_calendar.id
  join public.coefficient_rules cr
    on lower(trim(cr.google_calendar_id)) = lower(trim(ce.source_google_calendar_id))
    and cr.active
  cross join lateral generate_series(
    date_trunc('month', ce.starts_at at time zone 'Europe/Paris'),
    date_trunc('month', (ce.ends_at - interval '1 microsecond') at time zone 'Europe/Paris'),
    interval '1 month'
  ) as month_slice(local_month_start)
  where ce.status <> 'cancelled'
    and resource_calendar.enabled
    and resource_calendar.is_resource
    and e.active
    and not ce.all_day
)
select
  employee_id,
  employee_name,
  string_agg(distinct calendar_name, ', ' order by calendar_name) as calendar_name,
  extract(year from month_start)::integer as year,
  extract(month from month_start)::integer as month,
  round(sum(elapsed_hours)::numeric, 2) as raw_hours,
  round(sum(elapsed_hours * coefficient)::numeric, 2) as weighted_hours,
  count(distinct event_id)::bigint as event_count
from event_month_slices
group by employee_id, employee_name, month_start;

grant select on public.monthly_hours to authenticated;

comment on column public.calendars.is_resource is
  'True only for Google Workspace resource calendars shown in Configuration.';
comment on column public.employees.email is
  'Login email provisioned in Supabase Auth for the selected employee resource.';
comment on column public.calendar_events.source_google_calendar_id is
  'Google organizer calendar ID used to resolve the preparation coefficient.';
comment on view public.monthly_hours is
  'Hours grouped by selected employee resource. Each event coefficient comes from its organizer calendar; unmapped organizers are excluded.';
