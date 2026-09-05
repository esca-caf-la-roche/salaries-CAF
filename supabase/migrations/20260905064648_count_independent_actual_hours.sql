-- Independent resources are billed for actual event time on every source calendar.
-- Keep existing employee rules and all underlying RLS policies unchanged.
alter table public.employee_school_year_settings
  drop constraint employee_school_year_settings_contract_minutes,
  add constraint employee_school_year_settings_contract_minutes
    check (annual_contract_minutes > 0 or (contract_type = 'INDEP' and annual_contract_minutes = 0));

update public.employees e
set contract_type = 'INDEP'
from public.calendars c
where c.id = e.resource_calendar_id
  and not e.is_unassigned_resource
  and c.name ~* '\([[:space:]]*Indep[[:space:]]*\)'
  and e.contract_type is distinct from 'INDEP';

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
  employee_id uuid;
  resource_id uuid;
  enabled_value boolean;
  login_email text;
  contract_text text;
  contract_value public.contract_type;
  annual_hours_value numeric;
  special_resource boolean;
  previous_user_id uuid;
  next_user_id uuid;
begin
  if jsonb_typeof(p_updates) <> 'array' then
    raise exception 'Liste de ressources invalide';
  end if;

  for item in select value from jsonb_array_elements(p_updates)
  loop
    employee_id := (item ->> 'id')::uuid;

    select c.id, e.is_unassigned_resource
    into resource_id, special_resource
    from public.employees e
    join public.calendars c on c.id = e.resource_calendar_id
    where e.id = employee_id
      and c.connection_id = p_connection_id
      and c.is_resource;

    if resource_id is null then
      raise exception 'Ressource Google inconnue';
    end if;

    enabled_value := coalesce((item ->> 'enabled')::boolean, false);
    login_email := nullif(lower(trim(item ->> 'loginEmail')), '');
    contract_text := nullif(upper(trim(item ->> 'contractType')), '');
    annual_hours_value := nullif(item ->> 'annualContractHours', '')::numeric;
    next_user_id := nullif(item ->> 'userId', '')::uuid;

    if special_resource then
      enabled_value := true;
      login_email := null;
      contract_value := null;
      annual_hours_value := null;
      next_user_id := null;
    else
      if contract_text is not null and contract_text not in ('CDI', 'CDII', 'CDD', 'INDEP') then
        raise exception 'Type de contrat invalide : choisissez CDI, CDII, CDD ou Indépendant';
      end if;
      contract_value := contract_text::public.contract_type;

      if enabled_value and (login_email is null or login_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
        raise exception 'Un e-mail valide est requis pour chaque ressource suivie';
      end if;
      if enabled_value and (contract_value is null or (contract_value <> 'INDEP' and (annual_hours_value is null or annual_hours_value <= 0))) then
        raise exception 'Le type de contrat et un nombre d''heures annuelles positif sont requis';
      end if;
    end if;

    select user_id into previous_user_id
    from public.employees
    where id = employee_id;

    update public.employees
    set active = enabled_value,
        email = login_email,
        user_id = next_user_id,
        contract_type = contract_value,
        annual_contract_hours = annual_hours_value
    where id = employee_id;

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

create or replace view public.monthly_hours
with (security_invoker = true)
as
with event_month_slices as (
  select
    e.id as employee_id,
    e.display_name as employee_name,
    coalesce(cr.label, ce.source_google_calendar_id, resource_calendar.name) as calendar_name,
    ce.id as event_id,
    month_slice.local_month_start::date as month_start,
    to_char(
      greatest(
        ce.starts_at,
        month_slice.local_month_start at time zone 'Europe/Paris'
      ) at time zone 'Europe/Paris',
      'IYYY-IW'
    ) as iso_week,
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
    (case when e.contract_type = 'INDEP' then 1::numeric else cr.coefficient end)::numeric(8,4) as coefficient,
    case when e.contract_type = 'INDEP' then 'contract'::public.hour_category else cr.hour_category end as hour_category
  from public.calendar_events ce
  join public.calendars resource_calendar on resource_calendar.id = ce.calendar_id
  join public.employees e on e.resource_calendar_id = resource_calendar.id
  left join public.coefficient_rules cr
    on lower(trim(cr.google_calendar_id)) = lower(trim(ce.source_google_calendar_id))
    and cr.active
    and cr.hour_category is not null
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
    and (e.contract_type = 'INDEP' or cr.id is not null)
)
select
  employee_id,
  employee_name,
  string_agg(distinct calendar_name, ', ' order by calendar_name) as calendar_name,
  extract(year from month_start)::integer
    - case when extract(month from month_start) < 9 then 1 else 0 end as school_year,
  extract(year from month_start)::integer as year,
  extract(month from month_start)::integer as month,
  round(sum(elapsed_hours)::numeric, 2) as raw_hours,
  round(sum(elapsed_hours * coefficient)::numeric, 2) as weighted_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'contract'
  ), 0)::numeric, 2) as contract_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'absence'
  ), 0)::numeric, 2) as absence_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'replacement'
  ), 0)::numeric, 2) as replacement_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'public_holiday'
  ), 0)::numeric, 2) as public_holiday_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'contract' and coefficient = 1.25
  ), 0)::numeric, 2) as contract_with_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'contract' and coefficient = 1
  ), 0)::numeric, 2) as contract_without_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'absence' and coefficient = 1.25
  ), 0)::numeric, 2) as absence_with_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'absence' and coefficient = 1
  ), 0)::numeric, 2) as absence_without_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'replacement' and coefficient = 1.25
  ), 0)::numeric, 2) as replacement_with_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'replacement' and coefficient = 1
  ), 0)::numeric, 2) as replacement_without_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'public_holiday' and coefficient = 1.25
  ), 0)::numeric, 2) as public_holiday_with_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'public_holiday' and coefficient = 1
  ), 0)::numeric, 2) as public_holiday_without_prep_hours,
  count(distinct iso_week) filter (where hour_category = 'contract')::integer as worked_weeks,
  count(distinct event_id)::bigint as event_count
from event_month_slices
group by employee_id, employee_name, month_start;


create or replace view public.monthly_event_hours
with (security_invoker = true)
as
select
  ce.id as event_id,
  e.id as employee_id,
  e.display_name as employee_name,
  extract(year from month_slice.local_month_start)::integer
    - case when extract(month from month_slice.local_month_start) < 9 then 1 else 0 end as school_year,
  extract(month from month_slice.local_month_start)::integer as month,
  ce.summary as title,
  coalesce(cr.label, ce.source_google_calendar_id, resource_calendar.name) as calendar_name,
  cr.color as calendar_color,
  greatest(
    ce.starts_at,
    month_slice.local_month_start at time zone 'Europe/Paris'
  ) as starts_at,
  least(
    ce.ends_at,
    (month_slice.local_month_start + interval '1 month') at time zone 'Europe/Paris'
  ) as ends_at,
  extract(epoch from (
    least(ce.ends_at, (month_slice.local_month_start + interval '1 month') at time zone 'Europe/Paris')
    - greatest(ce.starts_at, month_slice.local_month_start at time zone 'Europe/Paris')
  )) / 3600.0 as raw_hours,
  extract(epoch from (
    least(ce.ends_at, (month_slice.local_month_start + interval '1 month') at time zone 'Europe/Paris')
    - greatest(ce.starts_at, month_slice.local_month_start at time zone 'Europe/Paris')
  )) / 3600.0 * (case when e.contract_type = 'INDEP' then 1::numeric else cr.coefficient end) as weighted_hours,
  (case when e.contract_type = 'INDEP' then 1::numeric else cr.coefficient end)::numeric(8,4) as coefficient,
  case when e.contract_type = 'INDEP' then 'contract'::public.hour_category else cr.hour_category end as hour_category,
  (e.contract_type is distinct from 'INDEP' and cr.coefficient = 1.25) as has_preparation
from public.calendar_events ce
join public.calendars resource_calendar on resource_calendar.id = ce.calendar_id
join public.employees e on e.resource_calendar_id = resource_calendar.id
left join public.coefficient_rules cr
  on lower(trim(cr.google_calendar_id)) = lower(trim(ce.source_google_calendar_id))
  and cr.active
  and cr.hour_category is not null
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
  and (e.contract_type = 'INDEP' or cr.id is not null);

comment on view public.monthly_event_hours is
  'Event-level monthly detail with full numeric precision. Presentation rounds only after monthly reconciliation.';

create or replace view public.employee_school_year_weeks
with (security_invoker = true)
as
select
  e.id as employee_id,
  extract(year from ce.starts_at at time zone 'Europe/Paris')::integer
    - case when extract(month from ce.starts_at at time zone 'Europe/Paris') < 9 then 1 else 0 end as school_year,
  count(distinct to_char(ce.starts_at at time zone 'Europe/Paris', 'IYYY-IW'))::integer as worked_weeks
from public.calendar_events ce
join public.calendars resource_calendar on resource_calendar.id = ce.calendar_id
join public.employees e on e.resource_calendar_id = resource_calendar.id
left join public.coefficient_rules cr
  on lower(trim(cr.google_calendar_id)) = lower(trim(ce.source_google_calendar_id))
  and cr.active
  and cr.hour_category = 'contract'
where ce.status <> 'cancelled'
  and resource_calendar.enabled
  and resource_calendar.is_resource
  and e.active
  and not ce.all_day
  and (e.contract_type = 'INDEP' or cr.id is not null)
group by e.id,
  extract(year from ce.starts_at at time zone 'Europe/Paris')::integer
    - case when extract(month from ce.starts_at at time zone 'Europe/Paris') < 9 then 1 else 0 end;
