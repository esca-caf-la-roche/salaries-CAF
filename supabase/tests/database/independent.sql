-- Run after all migrations; fixtures and changes are rolled back.
begin;
do $$
declare
  owner_id uuid := gen_random_uuid();
  connection_id uuid := gen_random_uuid();
  resource_id uuid := gen_random_uuid();
  fixture_employee_id uuid := gen_random_uuid();
  source_prefix text := 'independent-test-' || gen_random_uuid()::text;
  summary_row record;
begin
  insert into auth.users (id, email) values (owner_id, source_prefix || '@example.test');
  insert into public.google_connections (id, owner_id) values (connection_id, owner_id);
  insert into public.calendars (id, connection_id, google_calendar_id, name, enabled, is_resource)
  values (resource_id, connection_id, source_prefix || '@resource.calendar.google.com', '(Indep)-Test', true, true);
  insert into public.employees (id, display_name, email, active, resource_calendar_id, contract_type)
  values (fixture_employee_id, 'Independent fixture', source_prefix || '@example.test', true, resource_id, 'INDEP');
  insert into public.employee_school_year_settings (employee_id, school_year, contract_type, annual_contract_minutes)
  values (fixture_employee_id, 2026, 'INDEP', 0);
  insert into public.coefficient_rules (google_calendar_id, label, coefficient, hour_category, active)
  values (source_prefix || '-prep', 'Preparation', 1.25, 'contract', true),
         (source_prefix || '-absence', 'Absence', 1.25, 'absence', true),
         (source_prefix || '-inactive', 'Inactive', 1, null, false);
  insert into public.calendar_events (calendar_id, google_event_id, source_google_calendar_id, starts_at, ends_at)
  select resource_id, source_name, source_prefix || source_name,
    '2026-09-07 10:00+02'::timestamptz, '2026-09-07 12:00+02'::timestamptz
  from unnest(array['-prep', '-absence', '-inactive', '-missing']) source_name;
  insert into public.calendar_events (calendar_id, google_event_id, source_google_calendar_id, starts_at, ends_at, status)
  values (resource_id, 'cancelled', source_prefix || '-prep', '2026-09-07 10:00+02', '2026-09-07 12:00+02', 'cancelled');
  insert into public.calendar_events (calendar_id, google_event_id, all_day, start_date, end_date)
  values (resource_id, 'all-day', true, '2026-09-07', '2026-09-08');
  select * into strict summary_row from public.monthly_hours where monthly_hours.employee_id = fixture_employee_id and month = 9;
  if summary_row.raw_hours <> 8 or summary_row.weighted_hours <> 8 or summary_row.contract_hours <> 8
    or summary_row.absence_hours <> 0 or summary_row.event_count <> 4 or summary_row.contract_with_prep_hours <> 0 then
    raise exception 'Independent must count actual duration on all calendars: %', row_to_json(summary_row);
  end if;
  if (select count(*) from public.monthly_event_hours h where h.employee_id = fixture_employee_id and coefficient = 1 and not has_preparation and weighted_hours = 2 and hour_category = 'contract') <> 4 then
    raise exception 'Independent event detail must match actual durations without preparation';
  end if;
  if (select worked_weeks from public.employee_school_year_weeks h where h.employee_id = fixture_employee_id and school_year = 2026) <> 1 then
    raise exception 'Independent worked weeks invalid';
  end if;
  if exists (select 1 from public.internal_used_coefficient_calendars(connection_id)) then
    raise exception 'Independent-only source calendars must not require coefficient configuration';
  end if;
  update public.employees set contract_type = 'CDI' where id = fixture_employee_id;
  if (select count(*) from public.internal_used_coefficient_calendars(connection_id)) <> 4 then
    raise exception 'Employee source calendars must remain configurable';
  end if;
  select * into strict summary_row from public.monthly_hours h where h.employee_id = fixture_employee_id and month = 9;
  if summary_row.raw_hours <> 4 or summary_row.weighted_hours <> 5 or summary_row.contract_hours <> 2.5
    or summary_row.absence_hours <> 2.5 or summary_row.event_count <> 2 then
    raise exception 'Employee coefficient and exclusion rules regressed: %', row_to_json(summary_row);
  end if;
end;
$$;
rollback;
