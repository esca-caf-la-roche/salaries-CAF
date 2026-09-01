-- À exécuter après migration dans l'environnement local Supabase.
begin;

do $$
begin
  if not exists (select 1 from pg_class where oid = 'public.monthly_hours'::regclass) then
    raise exception 'Vue monthly_hours absente';
  end if;
  if has_table_privilege('authenticated', 'private.google_credentials', 'select') then
    raise exception 'authenticated ne doit jamais lire les jetons Google';
  end if;
  if has_function_privilege('authenticated', 'public.internal_get_google_credentials(uuid)', 'execute') then
    raise exception 'authenticated ne doit jamais exécuter internal_get_google_credentials';
  end if;
  if not has_function_privilege('service_role', 'public.internal_get_google_credentials(uuid)', 'execute') then
    raise exception 'service_role doit pouvoir récupérer les jetons Google';
  end if;
  if exists (select 1 from public.coefficient_rules where coefficient not in (1, 1.25)) then
    raise exception 'Coefficient inattendu dans le seed';
  end if;
  if not has_function_privilege('service_role', 'public.internal_used_coefficient_calendars(uuid)', 'execute') then
    raise exception 'service_role doit pouvoir détecter les calendriers utilisés';
  end if;
  if not has_function_privilege('service_role', 'public.internal_sync_coefficient_calendar_metadata(uuid,jsonb)', 'execute') then
    raise exception 'service_role doit pouvoir actualiser les couleurs Google';
  end if;
  if has_function_privilege('authenticated', 'public.internal_sync_coefficient_calendar_metadata(uuid,jsonb)', 'execute') then
    raise exception 'authenticated ne doit pas modifier directement les couleurs Google';
  end if;
  if not has_function_privilege('service_role', 'public.internal_configure_coefficients(uuid,jsonb)', 'execute') then
    raise exception 'service_role doit pouvoir configurer les calendriers utilisés';
  end if;
  if has_function_privilege('authenticated', 'public.internal_configure_coefficients(uuid,jsonb)', 'execute') then
    raise exception 'authenticated ne doit pas modifier directement les coefficients';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'calendars' and column_name = 'is_resource'
  ) then
    raise exception 'Le marqueur de calendrier ressource est absent';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'resource_calendar_id'
  ) then
    raise exception 'La liaison salarié vers calendrier ressource est absente';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'contract_type'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'annual_contract_hours'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'is_unassigned_resource'
  ) then
    raise exception 'La configuration du contrat ou de la ressource à déterminer est incomplète';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'coefficient_rules'
      and column_name = 'hour_category' and is_nullable = 'YES'
  ) then
    raise exception 'La catégorie d''heures nullable est absente';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'coefficient_rules'
      and column_name = 'color' and is_nullable = 'YES'
  ) then
    raise exception 'La couleur Google nullable est absente des règles';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'coefficient_rules' and column_name = 'hour_type'
  ) then
    raise exception 'Les anciens types d''heures ne doivent plus exister';
  end if;
  if exists (
    select 1 from public.coefficient_rules
    where active and hour_category is null
  ) then
    raise exception 'Une règle active ne peut pas avoir une catégorie d''heures indéfinie';
  end if;
  if (
    select array_agg(enumlabel::text order by enumsortorder)
    from pg_enum
    where enumtypid = 'public.hour_category'::regtype
  ) is distinct from array['contract', 'absence', 'replacement', 'public_holiday'] then
    raise exception 'Les quatre catégories d''heures sont invalides';
  end if;
  if (
    select count(*) from public.coefficient_rules
    where report_column in (
      'Avec prépa', 'Sans prépa', 'Absences avec prépa', 'Absences sans prépa',
      'Remplacements avec prépa', 'Remplacements sans prépa', 'Fériés (avec prépa)'
    ) and hour_category is not null and coefficient in (1, 1.25)
  ) < 38 then
    raise exception 'La configuration CSV des calendriers est incomplète';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'monthly_hours' and column_name = 'school_year'
  ) then
    raise exception 'La saison scolaire est absente de monthly_hours';
  end if;
  if not exists (
    select 1 from pg_class
    where oid = 'public.monthly_hours'::regclass
      and reloptions @> array['security_invoker=true']
  ) then
    raise exception 'monthly_hours doit respecter les politiques RLS de l''appelant';
  end if;
  if not has_table_privilege('authenticated', 'public.monthly_hours', 'select')
    or has_table_privilege('anon', 'public.monthly_hours', 'select') then
    raise exception 'Les droits de lecture de monthly_hours sont invalides';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'monthly_hours' and column_name = 'contract_hours'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'monthly_hours' and column_name = 'absence_hours'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'monthly_hours' and column_name = 'replacement_hours'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'monthly_hours' and column_name = 'public_holiday_hours'
  ) then
    raise exception 'La répartition entre les quatre catégories d''heures est incomplète';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'employee_school_year_settings'
  ) or not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'employee_monthly_payroll'
  ) then
    raise exception 'Le suivi annuel des contrats et bulletins est absent';
  end if;
  if not exists (
    select 1 from pg_class
    where oid = 'public.monthly_event_hours'::regclass
      and reloptions @> array['security_invoker=true']
  ) then
    raise exception 'monthly_event_hours doit respecter les politiques RLS de l''appelant';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'monthly_hours' and column_name = 'worked_weeks'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'monthly_hours' and column_name = 'contract_with_prep_hours'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'monthly_hours' and column_name = 'replacement_without_prep_hours'
  ) then
    raise exception 'Le détail mensuel par préparation et semaines est incomplet';
  end if;
  if has_table_privilege('anon', 'public.employee_monthly_payroll', 'select')
    or not has_table_privilege('authenticated', 'public.employee_monthly_payroll', 'select') then
    raise exception 'Les droits du suivi des bulletins sont invalides';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'calendar_events' and column_name = 'source_google_calendar_id'
  ) then
    raise exception 'Le calendrier organisateur de l''événement est absent';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'calendar_events' and column_name = 'coefficient_rule_id'
  ) then
    raise exception 'La règle de coefficient par événement est absente';
  end if;
end
$$;

do $$
declare
  target_calendar public.calendars%rowtype;
  target_employee public.employees%rowtype;
begin
  select * into target_calendar
  from public.calendars
  where lower(trim(google_calendar_id)) = 'c_1885o4bj2rlv4gijgd278pfg9rub0@resource.calendar.google.com'
  limit 1;

  if target_calendar.id is null then
    return;
  end if;

  if not target_calendar.is_resource or not target_calendar.enabled then
    raise exception 'La ressource A DETERMINER doit être une ressource Google activée';
  end if;

  select * into target_employee
  from public.employees
  where resource_calendar_id = target_calendar.id
  limit 1;

  if target_employee.id is null
    or not target_employee.is_unassigned_resource
    or not target_employee.active
    or target_employee.email is not null
    or target_employee.user_id is not null
    or target_employee.contract_type is not null
    or target_employee.annual_contract_hours is not null then
    raise exception 'La ressource A DETERMINER est mal configurée';
  end if;
end
$$;

rollback;
