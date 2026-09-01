create type public.contract_type as enum ('CDI', 'CDII', 'CDD');
create type public.hour_category as enum ('contract', 'absence', 'replacement', 'public_holiday');

alter table public.employees
  add column contract_type public.contract_type,
  add column annual_contract_hours numeric(8,2),
  add column is_unassigned_resource boolean not null default false,
  add constraint employees_annual_contract_hours_positive
    check (annual_contract_hours is null or annual_contract_hours > 0),
  add constraint employees_unassigned_has_no_account_or_contract
    check (
      not is_unassigned_resource
      or (
        email is null
        and user_id is null
        and contract_type is null
        and annual_contract_hours is null
      )
    );

alter table public.employees
  drop constraint employees_selected_resource_requires_email,
  add constraint employees_selected_resource_requires_email
    check (
      resource_calendar_id is null
      or not active
      or is_unassigned_resource
      or nullif(trim(email), '') is not null
    );

alter table public.coefficient_rules
  add column hour_category public.hour_category not null default 'contract';

update public.employees e
set is_unassigned_resource = true,
    active = true,
    email = null,
    user_id = null,
    contract_type = null,
    annual_contract_hours = null
from public.calendars c
where c.id = e.resource_calendar_id
  and upper(trim(c.name)) = '(CDII)-A DETERMINER';

update public.calendars c
set enabled = true
from public.employees e
where e.resource_calendar_id = c.id
  and e.is_unassigned_resource;

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
      if contract_text is not null and contract_text not in ('CDI', 'CDII', 'CDD') then
        raise exception 'Type de contrat invalide : choisissez CDI, CDII ou CDD';
      end if;
      contract_value := contract_text::public.contract_type;

      if enabled_value and (login_email is null or login_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
        raise exception 'Un e-mail valide est requis pour chaque ressource suivie';
      end if;
      if enabled_value and (contract_value is null or annual_hours_value is null or annual_hours_value <= 0) then
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

drop function public.internal_used_coefficient_calendars(uuid);
create function public.internal_used_coefficient_calendars(
  p_connection_id uuid
)
returns table (
  google_calendar_id text,
  label text,
  coefficient numeric,
  hour_category public.hour_category,
  event_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    lower(trim(ce.source_google_calendar_id)) as google_calendar_id,
    coalesce(
      max(cr.label),
      max(nullif(trim(ce.raw #>> '{organizer,displayName}'), '')),
      lower(trim(ce.source_google_calendar_id))
    ) as label,
    max(cr.coefficient) as coefficient,
    coalesce(max(cr.hour_category::text)::public.hour_category, 'contract'::public.hour_category) as hour_category,
    count(*)::bigint as event_count
  from public.calendar_events ce
  join public.calendars resource_calendar on resource_calendar.id = ce.calendar_id
  left join public.coefficient_rules cr
    on lower(trim(cr.google_calendar_id)) = lower(trim(ce.source_google_calendar_id))
    and cr.active
  where resource_calendar.connection_id = p_connection_id
    and resource_calendar.is_resource
    and nullif(trim(ce.source_google_calendar_id), '') is not null
    and ce.status <> 'cancelled'
  group by lower(trim(ce.source_google_calendar_id))
  order by label, google_calendar_id;
$$;

create or replace function public.internal_configure_coefficients(
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
  source_id text;
  coefficient_value numeric;
  category_text text;
  category_value public.hour_category;
  detected_label text;
  detected_count bigint;
  rule_id uuid;
begin
  if jsonb_typeof(p_updates) <> 'array' then
    raise exception 'Liste de calendriers invalide';
  end if;

  for item in select value from jsonb_array_elements(p_updates)
  loop
    source_id := nullif(lower(trim(item ->> 'googleCalendarId')), '');
    coefficient_value := (item ->> 'coefficient')::numeric;
    category_text := nullif(lower(trim(item ->> 'hourCategory')), '');

    if source_id is null or coefficient_value is null or coefficient_value not in (1, 1.25) then
      raise exception 'Coefficient invalide : choisissez 1 ou 1,25';
    end if;
    if category_text is null or category_text not in ('contract', 'absence', 'replacement', 'public_holiday') then
      raise exception 'Type de comptage invalide';
    end if;
    category_value := category_text::public.hour_category;

    select
      count(*),
      coalesce(
        max(cr.label),
        max(nullif(trim(ce.raw #>> '{organizer,displayName}'), '')),
        source_id
      )
    into detected_count, detected_label
    from public.calendar_events ce
    join public.calendars resource_calendar on resource_calendar.id = ce.calendar_id
    left join public.coefficient_rules cr
      on lower(trim(cr.google_calendar_id)) = source_id
    where resource_calendar.connection_id = p_connection_id
      and resource_calendar.is_resource
      and lower(trim(ce.source_google_calendar_id)) = source_id;

    if detected_count = 0 then
      raise exception 'Calendrier utilisé inconnu';
    end if;

    insert into public.coefficient_rules (google_calendar_id, label, coefficient, hour_category, active)
    values (source_id, detected_label, coefficient_value, category_value, true)
    on conflict (google_calendar_id) do update
      set coefficient = excluded.coefficient,
          hour_category = excluded.hour_category,
          active = true,
          updated_at = now()
    returning id into rule_id;

    update public.calendar_events
    set coefficient_rule_id = rule_id
    where lower(trim(source_google_calendar_id)) = source_id;
  end loop;
end;
$$;

revoke all on function public.internal_used_coefficient_calendars(uuid) from public, anon, authenticated;
grant execute on function public.internal_used_coefficient_calendars(uuid) to service_role;
revoke all on function public.internal_configure_coefficients(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.internal_configure_coefficients(uuid,jsonb) to service_role;

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
    cr.coefficient,
    cr.hour_category
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
  extract(year from month_start)::integer
    - case when extract(month from month_start) < 9 then 1 else 0 end as school_year,
  extract(year from month_start)::integer as year,
  extract(month from month_start)::integer as month,
  round(sum(elapsed_hours)::numeric, 2) as raw_hours,
  round(sum(elapsed_hours * coefficient)::numeric, 2) as weighted_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (where hour_category = 'contract'), 0)::numeric, 2) as contract_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (where hour_category = 'absence'), 0)::numeric, 2) as absence_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (where hour_category = 'replacement'), 0)::numeric, 2) as replacement_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (where hour_category = 'public_holiday'), 0)::numeric, 2) as public_holiday_hours,
  count(distinct event_id)::bigint as event_count
from event_month_slices
group by employee_id, employee_name, month_start;

grant select on public.monthly_hours to authenticated;

comment on column public.employees.contract_type is
  'Employee contract type shown in Configuration; null for the unassigned-resource calendar.';
comment on column public.employees.annual_contract_hours is
  'Contracted hours for one school year running from September 1 through August 31.';
comment on column public.employees.is_unassigned_resource is
  'True only for (CDII)-A DETERMINER, which is admin-only and always synchronized without a login account.';
comment on column public.coefficient_rules.hour_category is
  'Annual report bucket: contract, absence, replacement or public holiday.';
comment on view public.monthly_hours is
  'Hours grouped by employee and school year (September through August), with one total per configured hour category.';
