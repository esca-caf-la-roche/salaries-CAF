alter table public.coefficient_rules
  add constraint coefficient_rules_supported_values
  check (coefficient in (1, 1.25)) not valid;

alter table public.coefficient_rules
  validate constraint coefficient_rules_supported_values;

create or replace function public.internal_used_coefficient_calendars(
  p_connection_id uuid
)
returns table (
  google_calendar_id text,
  label text,
  coefficient numeric,
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
  detected_label text;
  detected_count bigint;
  rule_id uuid;
begin
  if jsonb_typeof(p_updates) <> 'array' then
    raise exception 'Liste de coefficients invalide';
  end if;

  for item in select value from jsonb_array_elements(p_updates)
  loop
    source_id := nullif(lower(trim(item ->> 'googleCalendarId')), '');
    coefficient_value := (item ->> 'coefficient')::numeric;

    if source_id is null or coefficient_value is null or coefficient_value not in (1, 1.25) then
      raise exception 'Coefficient invalide : choisissez 1 ou 1,25';
    end if;

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

    insert into public.coefficient_rules (google_calendar_id, label, coefficient, active)
    values (source_id, detected_label, coefficient_value, true)
    on conflict (google_calendar_id) do update
      set coefficient = excluded.coefficient,
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

comment on function public.internal_used_coefficient_calendars(uuid) is
  'Lists only organizer calendars actually used by synchronized events for one Google connection.';
comment on function public.internal_configure_coefficients(uuid,jsonb) is
  'Atomically applies supported preparation coefficients to detected organizer calendars.';
