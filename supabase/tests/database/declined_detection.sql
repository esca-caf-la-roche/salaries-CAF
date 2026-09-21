-- À exécuter après migration dans l'environnement local Supabase.
begin;

do $$
begin
  if not has_function_privilege('service_role', 'public.internal_count_stale_attendee_events(uuid)', 'execute') then
    raise exception 'service_role doit pouvoir compter les événements sans attendees';
  end if;
  if has_function_privilege('authenticated', 'public.internal_count_stale_attendee_events(uuid)', 'execute') then
    raise exception 'authenticated ne doit pas compter les événements sans attendees';
  end if;
  if has_function_privilege('anon', 'public.internal_count_stale_attendee_events(uuid)', 'execute') then
    raise exception 'anon ne doit pas compter les événements sans attendees';
  end if;
end $$;

-- Le comptage ignore les événements annulés et ne couvre que les calendriers
-- ressources actifs d'une connexion donnée.
do $$
declare
  v_total bigint;
begin
  select count(*) into v_total
  from calendar_events ce
  join calendars c on c.id = ce.calendar_id
  where c.connection_id = (select id from google_connections limit 1)
    and c.is_resource and c.enabled
    and ce.status <> 'cancelled'
    and ce.raw->'attendees' is null;
  if v_total is null then
    raise exception 'Le comptage doit renvoyer une valeur';
  end if;
end $$;

commit;
