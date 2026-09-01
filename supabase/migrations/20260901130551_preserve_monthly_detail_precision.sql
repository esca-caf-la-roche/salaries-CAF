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
  cr.label as calendar_name,
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
  )) / 3600.0 * cr.coefficient as weighted_hours,
  cr.coefficient,
  cr.hour_category,
  (cr.coefficient = 1.25) as has_preparation
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
  and not ce.all_day;

comment on view public.monthly_event_hours is
  'Event-level monthly detail with full numeric precision. Presentation rounds only after monthly reconciliation.';
