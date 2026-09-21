-- Comptage des événements à venir dont la fiche synchronisée ne contient pas d'attendees
-- (historique antérieur à l'ajout des champs attendees/htmlLink dans la sync).
create or replace function public.internal_count_stale_attendee_events(
  p_connection_id uuid
)
returns bigint
language sql
security definer
set search_path = ''
stable
as $$
  select count(*)::bigint
  from public.calendar_events ce
  join public.calendars c on c.id = ce.calendar_id
  where c.connection_id = p_connection_id
    and c.is_resource
    and c.enabled
    and ce.status <> 'cancelled'
    and ce.raw->'attendees' is null
$$;

revoke all on function public.internal_count_stale_attendee_events(uuid)
  from public, anon, authenticated;
grant execute on function public.internal_count_stale_attendee_events(uuid)
  to service_role;

comment on function public.internal_count_stale_attendee_events(uuid) is
  'Counts upcoming events of enabled resource calendars whose synced raw payload predates the attendees field; drives the automatic full resync.';
