-- Isolated fixtures only. No changes (including notifications) are committed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
do $$
declare
  owner_id uuid := gen_random_uuid();
  connection_id uuid := gen_random_uuid();
  resource_id uuid := gen_random_uuid();
  fixture_employee_id uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  prefix text := 'decline-test-' || gen_random_uuid()::text;
  before_hours jsonb;
  after_hours jsonb;
  before_events bigint;
begin
  insert into auth.users (id, email) values (owner_id, prefix || '@example.test');
  insert into public.google_connections (id, owner_id) values (connection_id, owner_id);
  insert into public.calendars (id, connection_id, google_calendar_id, name, enabled, is_resource)
  values (resource_id, connection_id, prefix || '@resource.calendar.google.com', '(CDI)-Reconciliation fixture', true, true);
  insert into public.employees (id, display_name, email, active, resource_calendar_id, contract_type)
  values (fixture_employee_id, 'Reconciliation fixture', prefix || '@example.test', true, resource_id, 'CDI');
  insert into public.coefficient_rules (google_calendar_id, label, coefficient, hour_category, active)
  values (prefix || '-source', 'Test source', 1, 'contract', true);
  insert into public.calendar_events (id, calendar_id, google_event_id, source_google_calendar_id, summary, starts_at, ends_at, raw)
  values (event_id, resource_id, 'event', prefix || '-source', 'Test', '2026-09-07 10:00+02', '2026-09-07 12:00+02', '{"etag":"v1"}');
  insert into public.monthly_time_validations (employee_id, school_year, month, validated_by)
  values (fixture_employee_id, 2026, 9, owner_id);
  select to_jsonb(h) into before_hours from public.monthly_hours h where h.employee_id = fixture_employee_id and h.month = 9;
  if before_hours is null then
    raise exception 'Fixture did not produce a monthly hours row';
  end if;
  select count(*) into before_events from public.monthly_validation_events e where e.employee_id = fixture_employee_id;

  update public.calendar_events set resource_decline_resolved_revision = repeat('a', 64) where id = event_id;
  -- Same columns as a normal partial sync upsert: omitted metadata must survive.
  insert into public.calendar_events (calendar_id, google_event_id, source_google_calendar_id, summary, starts_at, ends_at, raw)
  values (resource_id, 'event', prefix || '-source', 'Test', '2026-09-07 10:00+02', '2026-09-07 12:00+02', '{"etag":"v1"}')
  on conflict (calendar_id, google_event_id) do update set
    source_google_calendar_id = excluded.source_google_calendar_id, summary = excluded.summary,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at, raw = excluded.raw;
  if (select resource_decline_resolved_revision from public.calendar_events where id = event_id) is distinct from repeat('a', 64) then
    raise exception 'Partial sync upsert erased the reconciliation fingerprint';
  end if;
  if exists (select 1 from public.monthly_time_validations where employee_id = fixture_employee_id and (status <> 'validated' or change_count <> 0)) then
    raise exception 'Metadata reconciliation invalidated the validated month';
  end if;
  if (select count(*) from public.monthly_validation_events where employee_id = fixture_employee_id) <> before_events then
    raise exception 'Metadata reconciliation emitted a monthly validation event';
  end if;
  select to_jsonb(h) into after_hours from public.monthly_hours h where h.employee_id = fixture_employee_id and h.month = 9;
  if before_hours is distinct from after_hours then
    raise exception 'Metadata reconciliation changed monthly hours';
  end if;
end;
$$;
rollback;
