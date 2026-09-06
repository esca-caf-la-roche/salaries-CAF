begin;

do $$
declare
  fixture_admin uuid := gen_random_uuid();
  fixture_user uuid := gen_random_uuid();
  fixture_employee uuid := gen_random_uuid();
  fixture_connection uuid := gen_random_uuid();
  fixture_calendar uuid := gen_random_uuid();
  fixture_event uuid := gen_random_uuid();
  fixture_suffix text := gen_random_uuid()::text;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    fixture_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'admin-validation-' || fixture_suffix || '@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );
  update public.profiles set role = 'admin' where id = fixture_admin;

  insert into public.employees (id, display_name, email, active, contract_type, annual_contract_hours)
  values (fixture_employee, 'CDI validation fixture', 'validation-' || fixture_suffix || '@example.test', true, 'CDI', 100);

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    fixture_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'validation-' || fixture_suffix || '@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

  update public.employees set user_id = fixture_user where id = fixture_employee;
  insert into public.google_connections (id, owner_id) values (fixture_connection, fixture_admin);
  insert into public.calendars (
    id, connection_id, google_calendar_id, name, enabled, is_resource
  ) values (
    fixture_calendar, fixture_connection, 'validation-' || fixture_suffix || '@resource.calendar.google.com',
    'CDI validation fixture', true, true
  );
  update public.employees set resource_calendar_id = fixture_calendar where id = fixture_employee;

  perform set_config('request.jwt.claim.sub', fixture_user::text, true);
  set local role authenticated;
  perform public.validate_time_month(fixture_employee, 2025, 8);
  reset role;

  insert into public.calendar_events (
    id, calendar_id, google_event_id, status, summary, starts_at, ends_at, all_day
  ) values (
    fixture_event, fixture_calendar, 'validation-event-' || fixture_suffix, 'confirmed', 'Cours',
    '2026-08-12 16:00:00+00', '2026-08-12 18:00:00+00', false
  );

  if not exists (
    select 1 from public.monthly_time_validations
    where employee_id = fixture_employee and school_year = 2025 and month = 8
      and status = 'changes_pending' and change_detected_at is not null
  ) then
    raise exception 'Un nouvel événement après validation doit demander une approbation admin';
  end if;

  update public.calendar_events set last_seen_sync_run_id = null where id = fixture_event;
  if (select change_count from public.monthly_time_validations
      where employee_id = fixture_employee and school_year = 2025 and month = 8) <> 1 then
    raise exception 'Une mise à jour technique ne doit pas créer de faux positif';
  end if;

  perform set_config('request.jwt.claim.sub', fixture_admin::text, true);
  set local role authenticated;
  perform public.approve_time_month_change(fixture_employee, 2025, 8);
  reset role;

  if not exists (
    select 1 from public.monthly_time_validations
    where employee_id = fixture_employee and school_year = 2025 and month = 8
      and status = 'validated' and change_detected_at is null and approved_by = fixture_admin
  ) then
    raise exception 'L''approbation admin doit refermer l''alerte';
  end if;
end
$$;

rollback;
