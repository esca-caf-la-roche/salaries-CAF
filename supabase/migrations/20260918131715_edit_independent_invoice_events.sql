create or replace function public.internal_replace_independent_invoice_events(
  p_owner_id uuid, p_invoice_id uuid, p_event_ids uuid[], p_school_year integer
) returns integer
language plpgsql security definer set search_path = '' as $$
declare employee_id uuid; season_start timestamptz; season_end timestamptz; expected_count integer; valid_count integer; total integer;
begin
  if p_owner_id is null or p_invoice_id is null or p_event_ids is null or cardinality(p_event_ids) = 0 then raise exception 'Facture invalide'; end if;
  if (select count(distinct event_id) from unnest(p_event_ids) as event_id) <> cardinality(p_event_ids) then raise exception 'Un événement ne peut être sélectionné qu’une fois'; end if;
  select invoice.employee_id into employee_id from public.independent_invoices invoice join public.employees employee on employee.id=invoice.employee_id join public.calendars calendar on calendar.id=employee.resource_calendar_id join public.google_connections connection on connection.id=calendar.connection_id where invoice.id=p_invoice_id and connection.owner_id=p_owner_id for update of invoice;
  if employee_id is null then raise exception 'Facture introuvable'; end if;
  perform 1 from public.calendar_events event where event.id=any(p_event_ids) for update;
  season_start:=make_timestamptz(p_school_year,9,1,0,0,0,'Europe/Paris'); season_end:=make_timestamptz(p_school_year+1,9,1,0,0,0,'Europe/Paris'); expected_count:=cardinality(p_event_ids);
  select count(*) into valid_count from public.calendar_events event join public.calendars calendar on calendar.id=event.calendar_id join public.employees employee on employee.resource_calendar_id=calendar.id join public.google_connections connection on connection.id=calendar.connection_id where event.id=any(p_event_ids) and employee.id=employee_id and employee.active and employee.contract_type='INDEP' and calendar.enabled and calendar.is_resource and connection.owner_id=p_owner_id and not event.all_day and event.status<>'cancelled' and event.starts_at<season_end and event.ends_at>season_start;
  if valid_count<>expected_count then raise exception 'Les événements sélectionnés ne sont pas facturables pour cet indépendant'; end if;
  select sum(round(extract(epoch from (least(event.ends_at,season_end)-greatest(event.starts_at,season_start)))/60)::integer) into total from public.calendar_events event where event.id=any(p_event_ids);
  delete from public.independent_invoice_events where invoice_id=p_invoice_id;
  insert into public.independent_invoice_events(invoice_id,calendar_event_id,resource_calendar_id,google_event_id,title,starts_at,ends_at,duration_minutes) select p_invoice_id,event.id,event.calendar_id,event.google_event_id,coalesce(event.summary,'Événement sans titre'),greatest(event.starts_at,season_start),least(event.ends_at,season_end),round(extract(epoch from (least(event.ends_at,season_end)-greatest(event.starts_at,season_start)))/60)::integer from public.calendar_events event where event.id=any(p_event_ids);
  update public.independent_invoices set total_minutes=total where id=p_invoice_id;
  return total;
end; $$;
revoke all on function public.internal_replace_independent_invoice_events(uuid,uuid,uuid[],integer) from public,anon,authenticated;
