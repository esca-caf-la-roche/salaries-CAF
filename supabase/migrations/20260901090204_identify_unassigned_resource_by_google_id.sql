update public.employees e
set is_unassigned_resource = true,
    active = true,
    email = null,
    user_id = null,
    contract_type = null,
    annual_contract_hours = null
from public.calendars c
where c.id = e.resource_calendar_id
  and lower(trim(c.google_calendar_id)) = 'c_1885o4bj2rlv4gijgd278pfg9rub0@resource.calendar.google.com';

update public.calendars
set enabled = true
where lower(trim(google_calendar_id)) = 'c_1885o4bj2rlv4gijgd278pfg9rub0@resource.calendar.google.com';

comment on column public.employees.is_unassigned_resource is
  'True only for Google resource c_1885o4bj2rlv4gijgd278pfg9rub0@resource.calendar.google.com ((CDII)-A DETERMINER), which is admin-only and always synchronized without a login account.';
