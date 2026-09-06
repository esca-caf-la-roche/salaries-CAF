create type public.month_validation_event_type as enum (
  'employee_validated',
  'source_changed',
  'admin_approved'
);

create table public.monthly_validation_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  school_year integer not null check (school_year between 2000 and 2100),
  month smallint not null check (month between 1 and 12),
  event_type public.month_validation_event_type not null,
  actor_id uuid references auth.users(id) on delete set null,
  change_count integer not null default 0 check (change_count >= 0),
  occurred_at timestamptz not null default now()
);

create index monthly_validation_events_period_idx
  on public.monthly_validation_events (employee_id, school_year, month, occurred_at desc);

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  validation_event_id uuid not null references public.monthly_validation_events(id) on delete cascade,
  title text not null,
  body text not null,
  action_url text not null default '/',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (recipient_user_id, validation_event_id)
);

create index user_notifications_recipient_idx
  on public.user_notifications (recipient_user_id, read_at, created_at desc);

create table public.app_settings (
  singleton boolean primary key default true check (singleton),
  validation_alert_email text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint app_settings_validation_alert_email check (
    validation_alert_email is null
    or validation_alert_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  )
);

insert into public.app_settings (singleton) values (true);

create table public.validation_email_outbox (
  id uuid primary key default gen_random_uuid(),
  validation_event_id uuid not null unique references public.monthly_validation_events(id) on delete cascade,
  recipient_email text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  processing_started_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text
);

alter table public.monthly_validation_events enable row level security;
alter table public.user_notifications enable row level security;
alter table public.app_settings enable row level security;
alter table public.validation_email_outbox enable row level security;

revoke all on public.monthly_validation_events, public.user_notifications,
  public.app_settings, public.validation_email_outbox from anon, authenticated;
grant select on public.monthly_validation_events, public.user_notifications to authenticated;
grant update (read_at) on public.user_notifications to authenticated;
grant select, update (validation_alert_email) on public.app_settings to authenticated;

create policy monthly_validation_events_select
on public.monthly_validation_events for select to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1 from public.employees employee
    where employee.id = employee_id and employee.user_id = (select auth.uid())
  )
);

create policy user_notifications_select
on public.user_notifications for select to authenticated
using (recipient_user_id = (select auth.uid()));

create policy user_notifications_update
on public.user_notifications for update to authenticated
using (recipient_user_id = (select auth.uid()))
with check (recipient_user_id = (select auth.uid()));

create policy app_settings_admin_select
on public.app_settings for select to authenticated
using ((select private.is_admin()));

create policy app_settings_admin_update
on public.app_settings for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create or replace function private.notify_validation_event(
  p_event_id uuid,
  p_employee_id uuid,
  p_school_year integer,
  p_month integer,
  p_event_type public.month_validation_event_type
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_name text;
  month_name text;
  title_text text;
  body_text text;
  alert_email text;
begin
  select display_name into employee_name from public.employees where id = p_employee_id;
  month_name := to_char(make_date(case when p_month >= 9 then p_school_year else p_school_year + 1 end, p_month, 1), 'TMMonth YYYY');

  if p_event_type = 'employee_validated' then
    title_text := 'Mois validé par ' || employee_name;
    body_text := initcap(month_name) || ' attend votre contrôle.';
    insert into public.user_notifications (recipient_user_id, validation_event_id, title, body)
    select profile.id, p_event_id, title_text, body_text
    from public.profiles profile where profile.role = 'admin' and profile.active;

    select validation_alert_email into alert_email from public.app_settings where singleton;
    if alert_email is not null then
      insert into public.validation_email_outbox (validation_event_id, recipient_email, subject, body)
      values (p_event_id, alert_email, title_text, employee_name || ' a validé ' || initcap(month_name) || ' dans La Cordée.');
    end if;
  elsif p_event_type = 'source_changed' then
    title_text := 'Heures modifiées après validation';
    body_text := employee_name || ' · ' || initcap(month_name) || ' doit être contrôlé de nouveau.';
    insert into public.user_notifications (recipient_user_id, validation_event_id, title, body)
    select profile.id, p_event_id, title_text, body_text
    from public.profiles profile where profile.role = 'admin' and profile.active
    union
    select employee.user_id, p_event_id, title_text, body_text
    from public.employees employee where employee.id = p_employee_id and employee.user_id is not null;
  else
    title_text := 'Mois approuvé par l’administration';
    body_text := initcap(month_name) || ' a été approuvé.';
    insert into public.user_notifications (recipient_user_id, validation_event_id, title, body)
    select employee.user_id, p_event_id, title_text, body_text
    from public.employees employee where employee.id = p_employee_id and employee.user_id is not null;
  end if;
end;
$$;

revoke all on function private.notify_validation_event(uuid,uuid,integer,integer,public.month_validation_event_type)
  from public, anon, authenticated;

create or replace function private.flag_validated_event_month(
  p_calendar_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed record;
  history_id uuid;
begin
  for changed in
    update public.monthly_time_validations validation
    set status = 'changes_pending',
        change_detected_at = now(),
        change_count = validation.change_count + 1,
        approved_at = null,
        approved_by = null,
        updated_at = now()
    from public.employees employee,
         lateral generate_series(
           date_trunc('month', p_starts_at at time zone 'Europe/Paris'),
           date_trunc('month', (p_ends_at - interval '1 microsecond') at time zone 'Europe/Paris'),
           interval '1 month'
         ) affected_month(local_month_start)
    where p_starts_at is not null and p_ends_at is not null and p_ends_at > p_starts_at
      and employee.resource_calendar_id = p_calendar_id and employee.active and employee.contract_type = 'CDI'
      and validation.employee_id = employee.id and validation.status = 'validated'
      and validation.school_year = extract(year from affected_month.local_month_start)::integer
        - case when extract(month from affected_month.local_month_start) < 9 then 1 else 0 end
      and validation.month = extract(month from affected_month.local_month_start)::integer
    returning validation.employee_id, validation.school_year, validation.month, validation.change_count
  loop
    insert into public.monthly_validation_events (employee_id, school_year, month, event_type, change_count)
    values (changed.employee_id, changed.school_year, changed.month, 'source_changed', changed.change_count)
    returning id into history_id;
    perform private.notify_validation_event(history_id, changed.employee_id, changed.school_year, changed.month, 'source_changed');
  end loop;
end;
$$;

create or replace function public.validate_time_month(p_employee_id uuid, p_school_year integer, p_month integer)
returns public.monthly_time_validations
language plpgsql security definer set search_path = ''
as $$
declare month_start date; validation public.monthly_time_validations; history_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentification requise'; end if;
  if p_school_year not between 2000 and 2100 or p_month not between 1 and 12 then raise exception 'Période invalide'; end if;
  month_start := make_date(case when p_month >= 9 then p_school_year else p_school_year + 1 end, p_month, 1);
  if month_start + interval '1 month' > (current_timestamp at time zone 'Europe/Paris') then raise exception 'Seul un mois terminé peut être validé'; end if;
  if not exists (select 1 from public.employees employee where employee.id = p_employee_id and employee.user_id = (select auth.uid()) and employee.active and employee.contract_type = 'CDI') then
    raise exception 'Validation réservée au salarié CDI concerné';
  end if;
  if exists (select 1 from public.monthly_time_validations existing where existing.employee_id = p_employee_id and existing.school_year = p_school_year and existing.month = p_month) then
    raise exception 'Ce mois a déjà été validé';
  end if;
  insert into public.monthly_time_validations (employee_id, school_year, month, status, validated_at, validated_by, updated_at)
  values (p_employee_id, p_school_year, p_month, 'validated', now(), (select auth.uid()), now()) returning * into validation;
  insert into public.monthly_validation_events (employee_id, school_year, month, event_type, actor_id)
  values (p_employee_id, p_school_year, p_month, 'employee_validated', (select auth.uid())) returning id into history_id;
  perform private.notify_validation_event(history_id, p_employee_id, p_school_year, p_month, 'employee_validated');
  return validation;
end;
$$;

create or replace function public.approve_time_month_change(p_employee_id uuid, p_school_year integer, p_month integer)
returns public.monthly_time_validations
language plpgsql security definer set search_path = ''
as $$
declare validation public.monthly_time_validations; history_id uuid;
begin
  if not (select private.is_admin()) then raise exception 'Accès administrateur requis'; end if;
  update public.monthly_time_validations existing
  set status = 'validated', change_detected_at = null, approved_at = now(), approved_by = (select auth.uid()), updated_at = now()
  where existing.employee_id = p_employee_id and existing.school_year = p_school_year and existing.month = p_month and existing.status = 'changes_pending'
  returning * into validation;
  if validation.employee_id is null then raise exception 'Aucune modification en attente pour cette période'; end if;
  insert into public.monthly_validation_events (employee_id, school_year, month, event_type, actor_id, change_count)
  values (p_employee_id, p_school_year, p_month, 'admin_approved', (select auth.uid()), validation.change_count) returning id into history_id;
  perform private.notify_validation_event(history_id, p_employee_id, p_school_year, p_month, 'admin_approved');
  return validation;
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void language sql security invoker set search_path = ''
as $$
  update public.user_notifications set read_at = coalesce(read_at, now())
  where id = p_notification_id and recipient_user_id = (select auth.uid());
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon, authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;

comment on table public.monthly_validation_events is 'Historique immuable des transitions de validation mensuelle.';
comment on table public.user_notifications is 'Notifications persistantes affichées à la connexion.';
comment on table public.validation_email_outbox is 'File transactionnelle des alertes mail de validation salarié.';
