create table public.replacement_contacts (
  id uuid primary key default gen_random_uuid(),
  last_name text not null check (length(trim(last_name)) between 1 and 100),
  first_name text not null check (length(trim(first_name)) between 1 and 100),
  email text not null check (length(trim(email)) between 3 and 320),
  phone text not null check (length(trim(phone)) between 3 and 50),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index replacement_contacts_name_idx
on public.replacement_contacts (lower(last_name), lower(first_name));

create trigger replacement_contacts_set_updated_at
before update on public.replacement_contacts
for each row execute function private.set_updated_at();

comment on table public.replacement_contacts is
  'Annuaire administrateur des moniteurs externes susceptibles d effectuer des remplacements.';

alter table public.replacement_contacts enable row level security;

create policy replacement_contacts_admin_all
on public.replacement_contacts
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

grant select, insert, update, delete on public.replacement_contacts to authenticated;
revoke all on public.replacement_contacts from anon;
