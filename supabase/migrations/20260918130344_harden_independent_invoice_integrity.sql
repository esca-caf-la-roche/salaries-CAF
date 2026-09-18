alter table public.independent_invoice_events
  add column resource_calendar_id uuid;

update public.independent_invoice_events invoice_event
set resource_calendar_id = calendar_event.calendar_id
from public.calendar_events calendar_event
where calendar_event.id = invoice_event.calendar_event_id;

alter table public.independent_invoice_events
  alter column resource_calendar_id set not null;
create unique index independent_invoice_events_resource_google_event_unique
  on public.independent_invoice_events(resource_calendar_id, google_event_id);

create or replace function public.internal_create_independent_invoice(
  p_owner_id uuid, p_employee_id uuid, p_event_ids uuid[], p_school_year integer,
  p_invoice_number text default null, p_received_on date default current_date
) returns table(invoice_id uuid, total_minutes integer)
language plpgsql security definer set search_path = '' as $$
declare
  season_starts_at timestamptz; season_ends_at timestamptz; expected_events integer;
  selected_events integer; new_invoice_id uuid; new_total_minutes integer;
begin
  if p_owner_id is null or p_employee_id is null or p_school_year < 2000 or p_school_year > 2100 or p_event_ids is null or cardinality(p_event_ids) = 0 then raise exception 'Facture invalide'; end if;
  if (select count(distinct event_id) from unnest(p_event_ids) as event_id) <> cardinality(p_event_ids) then raise exception 'Un événement ne peut être sélectionné qu’une fois'; end if;
  perform 1 from public.calendar_events event where event.id = any(p_event_ids) for update;
  season_starts_at := make_timestamptz(p_school_year, 9, 1, 0, 0, 0, 'Europe/Paris'); season_ends_at := make_timestamptz(p_school_year + 1, 9, 1, 0, 0, 0, 'Europe/Paris'); expected_events := cardinality(p_event_ids);
  select count(*) into selected_events from public.calendar_events event join public.calendars calendar on calendar.id = event.calendar_id join public.employees employee on employee.resource_calendar_id = calendar.id join public.google_connections connection on connection.id = calendar.connection_id where event.id = any(p_event_ids) and employee.id = p_employee_id and employee.active and employee.contract_type = 'INDEP' and calendar.enabled and calendar.is_resource and connection.owner_id = p_owner_id and not event.all_day and event.status <> 'cancelled' and event.starts_at < season_ends_at and event.ends_at > season_starts_at;
  if selected_events <> expected_events then raise exception 'Les événements sélectionnés ne sont pas facturables pour cet indépendant'; end if;
  select coalesce(sum(round(extract(epoch from (least(event.ends_at, season_ends_at) - greatest(event.starts_at, season_starts_at))) / 60)::integer), 0) into new_total_minutes from public.calendar_events event where event.id = any(p_event_ids);
  if new_total_minutes <= 0 then raise exception 'La facture doit contenir une durée positive'; end if;
  insert into public.independent_invoices (employee_id, invoice_number, received_on, total_minutes, created_by) values (p_employee_id, nullif(btrim(p_invoice_number), ''), coalesce(p_received_on, current_date), new_total_minutes, p_owner_id) returning id into new_invoice_id;
  insert into public.independent_invoice_events (invoice_id, calendar_event_id, resource_calendar_id, google_event_id, title, starts_at, ends_at, duration_minutes)
  select new_invoice_id, event.id, event.calendar_id, event.google_event_id, coalesce(event.summary, 'Événement sans titre'), greatest(event.starts_at, season_starts_at), least(event.ends_at, season_ends_at), round(extract(epoch from (least(event.ends_at, season_ends_at) - greatest(event.starts_at, season_starts_at))) / 60)::integer from public.calendar_events event where event.id = any(p_event_ids);
  return query select new_invoice_id, new_total_minutes;
end;
$$;

revoke all on function public.internal_create_independent_invoice(uuid, uuid, uuid[], integer, text, date) from public, anon, authenticated;
