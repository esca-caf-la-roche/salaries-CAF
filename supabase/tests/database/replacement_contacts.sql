begin;

do $$
declare
  fixture_admin uuid := gen_random_uuid();
  fixture_employee uuid := gen_random_uuid();
  fixture_contact uuid;
  initial_updated_at timestamptz;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'replacement_contacts'
  ) then
    raise exception 'La table replacement_contacts est absente';
  end if;
  if has_table_privilege('anon', 'public.replacement_contacts', 'select')
    or not has_table_privilege('authenticated', 'public.replacement_contacts', 'select,insert,update,delete') then
    raise exception 'Les droits de replacement_contacts sont invalides';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'replacement_contacts'
      and policyname = 'replacement_contacts_admin_all'
  ) then
    raise exception 'La politique administrateur de replacement_contacts est absente';
  end if;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (fixture_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'admin-contacts@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (fixture_employee, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'employee-contacts@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
  update public.profiles set role = 'admin' where id = fixture_admin;

  perform set_config('request.jwt.claim.sub', fixture_admin::text, true);
  set local role authenticated;
  insert into public.replacement_contacts (last_name, first_name, email, phone, updated_at)
  values ('Martin', 'Alice', 'alice@example.test', '+33 6 01 02 03 04', now() - interval '1 day')
  returning id, updated_at into fixture_contact, initial_updated_at;
  update public.replacement_contacts set phone = '06 11 12 13 14' where id = fixture_contact;
  if not exists (
    select 1 from public.replacement_contacts
    where id = fixture_contact and created_by = fixture_admin and updated_at > initial_updated_at
  ) then raise exception 'Le CRUD admin ou le trigger updated_at est invalide'; end if;
  delete from public.replacement_contacts where id = fixture_contact;
  if found is false then raise exception 'La suppression admin a échoué'; end if;
  reset role;

  perform set_config('request.jwt.claim.sub', fixture_employee::text, true);
  set local role authenticated;
  if exists (select 1 from public.replacement_contacts) then
    raise exception 'Un salarié ne doit lire aucun contact';
  end if;
  begin
    insert into public.replacement_contacts (last_name, first_name, email, phone)
    values ('Interdit', 'Salarié', 'employee@example.test', '0600000000');
    raise exception 'Un salarié ne doit pas pouvoir créer de contact';
  exception when insufficient_privilege then null;
  end;
  reset role;
end
$$;

rollback;
