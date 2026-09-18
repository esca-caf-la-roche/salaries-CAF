create or replace function public.internal_update_independent_invoice(
  p_owner_id uuid,
  p_invoice_id uuid,
  p_invoice_number text,
  p_received_on date
)
returns table(invoice_id uuid, total_minutes integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_owner_id is null or p_invoice_id is null or p_received_on is null then raise exception 'Facture invalide'; end if;
  update public.independent_invoices invoice
  set invoice_number = nullif(btrim(p_invoice_number), ''), received_on = p_received_on
  from public.employees employee
  join public.calendars calendar on calendar.id = employee.resource_calendar_id
  join public.google_connections connection on connection.id = calendar.connection_id
  where invoice.id = p_invoice_id and invoice.employee_id = employee.id and connection.owner_id = p_owner_id;
  if not found then raise exception 'Facture introuvable'; end if;
  return query select invoice.id, invoice.total_minutes from public.independent_invoices invoice where invoice.id = p_invoice_id;
end;
$$;

revoke all on function public.internal_update_independent_invoice(uuid, uuid, text, date) from public, anon, authenticated;

create or replace function public.internal_delete_independent_invoice(p_owner_id uuid, p_invoice_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.independent_invoices invoice
  using public.employees employee
  join public.calendars calendar on calendar.id = employee.resource_calendar_id
  join public.google_connections connection on connection.id = calendar.connection_id
  where invoice.id = p_invoice_id and invoice.employee_id = employee.id and connection.owner_id = p_owner_id;
  if not found then raise exception 'Facture introuvable'; end if;
end;
$$;

revoke all on function public.internal_delete_independent_invoice(uuid, uuid) from public, anon, authenticated;
