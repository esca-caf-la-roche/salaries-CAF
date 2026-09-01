-- Preparation is represented by the coefficient, not by the business hour
-- category. Restore the four independent reporting buckets and keep the
-- category nullable so an unknown calendar remains explicitly "to define".

drop view public.monthly_hours;
drop function public.internal_used_coefficient_calendars(uuid);
drop function public.internal_configure_coefficients(uuid, jsonb);

create type public.hour_category as enum (
  'contract',
  'absence',
  'replacement',
  'public_holiday'
);

alter table public.coefficient_rules
  add column hour_category public.hour_category;

update public.coefficient_rules
set hour_category = case
  when hour_type in ('work_with_prep', 'work_without_prep') then 'contract'::public.hour_category
  when hour_type in ('absence_with_prep', 'absence_without_prep') then 'absence'::public.hour_category
  when hour_type in ('replacement_with_prep', 'replacement_without_prep') then 'replacement'::public.hour_category
  when hour_type = 'public_holiday_with_prep' then 'public_holiday'::public.hour_category
  else null
end;

-- A legacy rule whose former default did not identify a real business category
-- must behave like an entirely unconfigured calendar (category and coefficient
-- both exposed as null by the active-rule lookup).
update public.coefficient_rules
set active = false,
    updated_at = now()
where hour_category is null;

alter table public.coefficient_rules drop column hour_type;
drop type public.hour_type;

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
    max(cr.hour_category::text)::public.hour_category as hour_category,
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
  order by hour_category nulls first, label, google_calendar_id;
$$;

create function public.internal_configure_coefficients(
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
    if category_text is null or category_text not in (
      'contract', 'absence', 'replacement', 'public_holiday'
    ) then
      raise exception 'Type d''heures invalide';
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

    insert into public.coefficient_rules (
      google_calendar_id, label, coefficient, hour_category, active
    )
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

revoke all on function public.internal_used_coefficient_calendars(uuid)
  from public, anon, authenticated;
grant execute on function public.internal_used_coefficient_calendars(uuid)
  to service_role;
revoke all on function public.internal_configure_coefficients(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.internal_configure_coefficients(uuid, jsonb)
  to service_role;

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
  count(distinct event_id)::bigint as event_count
from event_month_slices
group by employee_id, employee_name, month_start;

revoke all on public.monthly_hours from public, anon;
grant select on public.monthly_hours to authenticated;

comment on column public.coefficient_rules.hour_category is
  'Independent reporting bucket: contract, absence, replacement or public holiday; null means that an administrator must define it.';
comment on view public.monthly_hours is
  'Configured hours grouped by employee, school year and four business categories. Calendars with an undefined category are excluded.';
