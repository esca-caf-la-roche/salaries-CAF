alter table public.coefficient_rules
  add column color text;

alter table public.coefficient_rules
  add constraint coefficient_rules_google_color
  check (color is null or color ~ '^#[0-9a-fA-F]{6}$')
  not valid;

alter table public.coefficient_rules
  validate constraint coefficient_rules_google_color;

drop function public.internal_used_coefficient_calendars(uuid);

create function public.internal_used_coefficient_calendars(
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
  left join public.coefficient_rules cr
    on lower(trim(cr.google_calendar_id)) = lower(trim(ce.source_google_calendar_id))
  where resource_calendar.connection_id = p_connection_id
    and resource_calendar.is_resource
    and nullif(trim(ce.source_google_calendar_id), '') is not null
    and ce.status <> 'cancelled'
  group by lower(trim(ce.source_google_calendar_id))
  order by hour_category nulls first, label, google_calendar_id;
$$;

create function public.internal_sync_coefficient_calendar_metadata(
  p_connection_id uuid,
  p_calendars jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  source_id text;
  calendar_label text;
  calendar_color text;
begin
  if jsonb_typeof(p_calendars) <> 'array' then
    raise exception 'Liste de calendriers Google invalide';
  end if;

  for item in select value from jsonb_array_elements(p_calendars)
  loop
    source_id := nullif(lower(trim(item ->> 'googleCalendarId')), '');
    calendar_label := coalesce(nullif(trim(item ->> 'label'), ''), source_id);
    calendar_color := nullif(trim(item ->> 'color'), '');

    if source_id is null then
      continue;
    end if;
    if calendar_color is not null and calendar_color !~ '^#[0-9a-fA-F]{6}$' then
      raise exception 'Couleur de calendrier Google invalide';
    end if;

    if exists (
      select 1
      from public.calendar_events ce
      join public.calendars resource_calendar on resource_calendar.id = ce.calendar_id
      where resource_calendar.connection_id = p_connection_id
        and resource_calendar.is_resource
        and ce.status <> 'cancelled'
        and lower(trim(ce.source_google_calendar_id)) = source_id
    ) then
      insert into public.coefficient_rules (
        google_calendar_id, label, color, coefficient, hour_category, active
      )
      values (source_id, calendar_label, calendar_color, 1, null, false)
      on conflict (google_calendar_id) do update
        set label = case
              when public.coefficient_rules.active then public.coefficient_rules.label
              else excluded.label
            end,
            color = excluded.color,
            updated_at = now();
    end if;
  end loop;
end;
$$;

revoke all on function public.internal_used_coefficient_calendars(uuid)
  from public, anon, authenticated;
grant execute on function public.internal_used_coefficient_calendars(uuid)
  to service_role;

revoke all on function public.internal_sync_coefficient_calendar_metadata(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.internal_sync_coefficient_calendar_metadata(uuid, jsonb)
  to service_role;

comment on column public.coefficient_rules.color is
  'Google Calendar backgroundColor in #RRGGBB format; null until metadata is refreshed.';
comment on function public.internal_sync_coefficient_calendar_metadata(uuid, jsonb) is
  'Stores Google colors only for source calendars already used by resource events of the requested connection.';
