create index replacement_contacts_created_by_idx
on public.replacement_contacts (created_by);

alter table public.replacement_contacts
  add constraint replacement_contacts_email_format
    check (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  add constraint replacement_contacts_phone_format
    check (regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[0-9]{6,15}$');
