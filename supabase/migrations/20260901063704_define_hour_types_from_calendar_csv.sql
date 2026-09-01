drop view public.monthly_hours;
drop function public.internal_used_coefficient_calendars(uuid);
drop function public.internal_configure_coefficients(uuid,jsonb);

create type public.hour_type as enum (
  'work_with_prep',
  'work_without_prep',
  'absence_with_prep',
  'absence_without_prep',
  'replacement_with_prep',
  'replacement_without_prep',
  'public_holiday_with_prep'
);

alter table public.coefficient_rules
  add column hour_type public.hour_type;

-- Preserve categories that were explicitly different from the former default.
-- The old `contract` value is deliberately left undefined: it was assigned by
-- default even when the calendar type had never been configured.
update public.coefficient_rules
set hour_type = case
  when hour_category = 'absence' and coefficient = 1.25 then 'absence_with_prep'::public.hour_type
  when hour_category = 'absence' then 'absence_without_prep'::public.hour_type
  when hour_category = 'replacement' and coefficient = 1.25 then 'replacement_with_prep'::public.hour_type
  when hour_category = 'replacement' then 'replacement_without_prep'::public.hour_type
  when hour_category = 'public_holiday' then 'public_holiday_with_prep'::public.hour_type
  else null
end;

alter table public.coefficient_rules drop column hour_category;
drop type public.hour_category;

-- Reference configuration supplied in Donnees_Calendar_coef - Donnees.csv.
-- report_column keeps the original business label while hour_type provides a
-- stable value for aggregation and frontend grouping.
insert into public.coefficient_rules (
  google_calendar_id,
  label,
  coefficient,
  report_column,
  hour_type,
  active
)
values
  ('c_4ed912f70b6b3db20a1aa55ee91a32c90e82bf6e9e41fb514b9ad671790a4bb6@group.calendar.google.com', '✔ Absences avec prépa', 1.25, 'Absences avec prépa', 'absence_with_prep', true),
  ('c_9c714509877cb1b793de86393009110dc8c001d378a376b34a4713a4c2821e6a@group.calendar.google.com', '✔ Absences sans prépa', 1, 'Absences sans prépa', 'absence_without_prep', true),
  ('c_fea8ad86099f38c322fc2280ae57ed555f39dc9323f37db0235b56b5e1a3f26b@group.calendar.google.com', '✔ Fériés', 1.25, 'Fériés (avec prépa)', 'public_holiday_with_prep', true),
  ('c_7e6c34d93f6974194ccf9f47c725c248dc371a77f0813ef54f2a12b2ce6820e2@group.calendar.google.com', '✔ Heures sans prépa', 1, 'Sans prépa', 'work_without_prep', true),
  ('c_0c7e7b5cd64848b9ff300c38c6ed06da82f39c7010f98b5ffd46c32b37bfbcf1@group.calendar.google.com', '✔ Remplacements', 1.25, 'Remplacements avec prépa', 'replacement_with_prep', true),
  ('c_6aed8d593cb24f14afb2489df74849dbcad6493214352b851e3c762bba9e6db6@group.calendar.google.com', '❌ Accès St Pierre', 1, 'Sans prépa', 'work_without_prep', true),
  ('c_fdc347f7970d1fa387c699f48f6d9b834492523f8d27ab66a71ee8ce3b2758be@group.calendar.google.com', '➕ Hugo - Remplacement sans prépa', 1, 'Remplacements sans prépa', 'replacement_without_prep', true),
  ('c_1ea591b9412bf6ba73b961bc67237b0f83d06d925be85d86889840887f2a0a42@group.calendar.google.com', '➕ Jérôme - Remplacement sans prépa', 1, 'Remplacements sans prépa', 'replacement_without_prep', true),
  ('c_e38db48306f44b03c995dc63aae0b0abad380982f418cccaad9516dac95c50d7@group.calendar.google.com', '➕ Gaël - Remplacement sans prépa', 1, 'Remplacements sans prépa', 'replacement_without_prep', true),
  ('c_b49ddcfa7b156d92ea21cf588b9336942b076937d40c66abbf55743d15451e90@group.calendar.google.com', '👊 Hugo - Heures avec prépa', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_24fb30f5fce90b6d5d0cad67dc6cdac6b7a3d588347762a5474a9e5012d122a0@group.calendar.google.com', '👊 Jérôme - Heure avec prépa', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_5f08ed3c1cc96e9ba23d913620b9d2a32378dd0f28ba31ac5528dc69291176c1@group.calendar.google.com', '👊 Gaël - Heures avec prépa', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_38b282a75083b57d6cdc7be51ee5cd14383016ba29af20bb4f3454b3c802f4bc@group.calendar.google.com', '💪 Hugo - Heures sans prépa', 1, 'Sans prépa', 'work_without_prep', true),
  ('c_05c73aac8b0e41085fb4aae6b7d59b7ecb148e9766dbc397fc7ecbe38e432cf5@group.calendar.google.com', '💪 Jérôme - Heures sans prépa', 1, 'Sans prépa', 'work_without_prep', true),
  ('c_57e6a52eaefe84fb4c6e1dc6b89c5c330e2652035dbe4865102120d966dc813f@group.calendar.google.com', '💪 Gaël - Heures sans prépa', 1, 'Sans prépa', 'work_without_prep', true),
  ('c_0095fde1b50f979abf81d0ef354f747fef59318b6eeb3ac1d79ff458cf189400@group.calendar.google.com', '01 - Clémentine B - St Pierre', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_f114048c0541253df7ea783e7eae6d6a2a7c1a2c9deafedfab0554df95a03423@group.calendar.google.com', '02 - Clémentine B - La Roche', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_ad625d1021c227ebfbcf96291ca1d1a322a515e44ec58c00cff467ac5d4c359c@group.calendar.google.com', '03 - David M - St Pierre', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_d3f25be9a756a21f04c941188ede791c5b076104b92e93ac7ee04af5e2b154ae@group.calendar.google.com', '04 - David M - La Roche', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_9b4333e9bd78681672014475874ee138eb0814967d2b3d366d6a9043f39b4503@group.calendar.google.com', '05 - Nicolas D - St Pierre', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_600d33df0ae675163b628fc798865efa45a090cc93f27adce722ef3e61a3c7b7@group.calendar.google.com', '06 - Nicolas D - La Roche', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_2ccf96ad3918b2f14d5462376c1fd64d3efbe5ccc316c0bb9d79a10ea642389b@group.calendar.google.com', '07 - Raphaël T - St Pierre', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_ffa6fc458f0b57f312b0caed51075530f29179fd15932cf742e84eb521d17470@group.calendar.google.com', '08 - Raphaël T - La Roche', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_d01679b20ded285137528ba9770d684d41706fe3170492f923b9b2a4c4e8fd7b@group.calendar.google.com', '09 - Stéphane C - St Pierre', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_4089e2cbfe1abdabf4417e229d223374b10e1b7c257b1c79c1d7d84bdb937f1a@group.calendar.google.com', '10 - Stéphane C - La Roche', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_99e9674884f45d405c5395e2d0bc06e3629a98ac3f569775a9cc36ed21518e0c@group.calendar.google.com', '11 - Clém / David / Nico (Samedi) - St Pierre', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_74b3e612c0e40d48f14a4a07c3b116684937173ad88c0cdfb72d247f9d7bb109@group.calendar.google.com', '12 - Clém / David / Nico (Samedi) - La Roche', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_73f77c217393d65c0361c270861fd8542a08c9cd24ba8dba33d548c99d501571@group.calendar.google.com', '13 - Groupe Perf - St Pierre', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_167342d036ea4db64ed77205741afb4d95f4ed46273f3e2ee8471886fdbcb11a@group.calendar.google.com', '14 - Groupe Perf - La Roche', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_ccddac6d564c3d71fa7c7d9651bdcee7584da1cbd40de45f45c11b3a194b26c3@group.calendar.google.com', '15 - Hugo M - St Pierre', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_3d8aa6bbef5e4b6030b0a4e84b91b63bd9e4d1c6c98b7c0ae74d843c7cf931f4@group.calendar.google.com', '16 - Hugo M - La Roche', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_02648c53ef6f208424abca0a352383757c6051c84f12e4d401ebdc18ff965f37@group.calendar.google.com', '17 - Hugo M - Arkose', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_415819330cb463267e5bdd212b37d05d636f24c5fce17759ffbc30a545bc631c@group.calendar.google.com', '18 - Jérôme G - St Pierre', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_9eead3b50ee6923a033509eeb002998fdf95e8139d519e02bc95973634d62cf9@group.calendar.google.com', '19 - Jérôme G - La Roche', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_0537c09c779b8ee87affa0ad95846430860fd69142bb8fbd6bf8ae5f2777df6a@group.calendar.google.com', '20 - Jérôme G - Arkose', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_5c8a0642f7330a6c3fdd1aeec526cedc000f1b70ab7321d7415e33faa745a594@group.calendar.google.com', '21 - Gaël M - St Pierre', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_99786d114d7ad69e3ab666d6de3515569b04bad8f1b9114af6e3292904e0f80b@group.calendar.google.com', '22 - Gaël M - La Roche', 1.25, 'Avec prépa', 'work_with_prep', true),
  ('c_1c0cd229bfe137d372f1a94a8045cb2110ab5f32e31f2ae95ff0431875809589@group.calendar.google.com', '23 - Gaël M - Arkose', 1.25, 'Avec prépa', 'work_with_prep', true)
on conflict (google_calendar_id) do update
set label = excluded.label,
    coefficient = excluded.coefficient,
    report_column = excluded.report_column,
    hour_type = excluded.hour_type,
    active = true,
    updated_at = now();

create function public.internal_used_coefficient_calendars(
  p_connection_id uuid
)
returns table (
  google_calendar_id text,
  label text,
  coefficient numeric,
  hour_type public.hour_type,
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
    max(cr.hour_type::text)::public.hour_type as hour_type,
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
  order by hour_type nulls first, label, google_calendar_id;
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
  hour_type_text text;
  hour_type_value public.hour_type;
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
    hour_type_text := nullif(lower(trim(item ->> 'hourType')), '');

    if source_id is null or coefficient_value is null or coefficient_value not in (1, 1.25) then
      raise exception 'Coefficient invalide : choisissez 1 ou 1,25';
    end if;
    if hour_type_text is null or hour_type_text not in (
      'work_with_prep',
      'work_without_prep',
      'absence_with_prep',
      'absence_without_prep',
      'replacement_with_prep',
      'replacement_without_prep',
      'public_holiday_with_prep'
    ) then
      raise exception 'Type d''heures invalide';
    end if;
    hour_type_value := hour_type_text::public.hour_type;

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

    insert into public.coefficient_rules (google_calendar_id, label, coefficient, hour_type, active)
    values (source_id, detected_label, coefficient_value, hour_type_value, true)
    on conflict (google_calendar_id) do update
      set coefficient = excluded.coefficient,
          hour_type = excluded.hour_type,
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
    cr.hour_type
  from public.calendar_events ce
  join public.calendars resource_calendar on resource_calendar.id = ce.calendar_id
  join public.employees e on e.resource_calendar_id = resource_calendar.id
  join public.coefficient_rules cr
    on lower(trim(cr.google_calendar_id)) = lower(trim(ce.source_google_calendar_id))
    and cr.active
    and cr.hour_type is not null
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
  round(coalesce(sum(elapsed_hours * coefficient) filter (where hour_type = 'work_with_prep'), 0)::numeric, 2) as work_with_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (where hour_type = 'work_without_prep'), 0)::numeric, 2) as work_without_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (where hour_type = 'absence_with_prep'), 0)::numeric, 2) as absence_with_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (where hour_type = 'absence_without_prep'), 0)::numeric, 2) as absence_without_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (where hour_type = 'replacement_with_prep'), 0)::numeric, 2) as replacement_with_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (where hour_type = 'replacement_without_prep'), 0)::numeric, 2) as replacement_without_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (where hour_type = 'public_holiday_with_prep'), 0)::numeric, 2) as public_holiday_with_prep_hours,
  count(distinct event_id)::bigint as event_count
from event_month_slices
group by employee_id, employee_name, month_start;

grant select on public.monthly_hours to authenticated;

comment on column public.coefficient_rules.hour_type is
  'Business hour type from the reference calendar CSV; null means that an administrator must define it.';
comment on view public.monthly_hours is
  'Configured hours grouped by employee, school year and the seven reference hour types. Calendars with an undefined type are excluded.';
