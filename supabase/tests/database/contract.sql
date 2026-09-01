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
    where table_schema = 'public' and table_name = 'coefficient_rules' and column_name = 'hour_type'
  ) then
    raise exception 'Le type d''heures est absent';
  end if;
  if (
    select count(*) from public.coefficient_rules
    where report_column in (
      'Avec prépa', 'Sans prépa', 'Absences avec prépa', 'Absences sans prépa',
      'Remplacements avec prépa', 'Remplacements sans prépa', 'Fériés (avec prépa)'
    ) and hour_type is not null and coefficient in (1, 1.25)
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
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'monthly_hours' and column_name = 'work_with_prep_hours'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'monthly_hours' and column_name = 'replacement_without_prep_hours'
  ) then
    raise exception 'La répartition par type d''heures est incomplète';
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

rollback;
