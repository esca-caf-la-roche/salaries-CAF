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
  if (select count(*) from public.coefficient_rules) <> 38 then
    raise exception 'Le seed doit contenir exactement 38 règles';
  end if;
  if exists (select 1 from public.coefficient_rules where coefficient not in (1, 1.25)) then
    raise exception 'Coefficient inattendu dans le seed';
  end if;
end
$$;

rollback;
