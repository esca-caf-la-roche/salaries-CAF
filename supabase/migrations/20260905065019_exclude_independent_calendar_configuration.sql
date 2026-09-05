create or replace function public.internal_used_coefficient_calendars(
  p_connection_id uuid
)
returns table (
  google_calendar_id text,
  label text,
  color text,
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
    max(cr.color) as color,
    max(cr.coefficient) filter (where cr.active) as coefficient,
    (max(cr.hour_category::text) filter (where cr.active))::public.hour_category as hour_category,
    count(*)::bigint as event_count
  from public.calendar_events ce
  join public.calendars resource_calendar on resource_calendar.id = ce.calendar_id
  join public.employees employee on employee.resource_calendar_id = resource_calendar.id
  left join public.coefficient_rules cr
    on lower(trim(cr.google_calendar_id)) = lower(trim(ce.source_google_calendar_id))
  where resource_calendar.connection_id = p_connection_id
    and resource_calendar.is_resource
    and employee.contract_type is distinct from 'INDEP'
    and nullif(trim(ce.source_google_calendar_id), '') is not null
    and ce.status <> 'cancelled'
  group by lower(trim(ce.source_google_calendar_id))
  order by hour_category nulls first, label, google_calendar_id;
$$;


revoke all on function public.internal_used_coefficient_calendars(uuid) from public, anon, authenticated;
grant execute on function public.internal_used_coefficient_calendars(uuid) to service_role;
