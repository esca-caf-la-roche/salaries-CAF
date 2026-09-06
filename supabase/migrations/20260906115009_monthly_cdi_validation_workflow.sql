create type public.month_validation_status as enum ('validated', 'changes_pending');

create table public.monthly_time_validations (
  employee_id uuid not null references public.employees(id) on delete cascade,
  school_year integer not null check (school_year between 2000 and 2100),
  month smallint not null check (month between 1 and 12),
  status public.month_validation_status not null default 'validated',
  validated_at timestamptz not null default now(),
  validated_by uuid not null references auth.users(id),
  change_detected_at timestamptz,
  change_count integer not null default 0 check (change_count >= 0),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (employee_id, school_year, month),
  constraint monthly_time_validations_change_state check (
    (status = 'validated' and change_detected_at is null)
    or (status = 'changes_pending' and change_detected_at is not null)
  )
);

create index monthly_time_validations_status_idx
  on public.monthly_time_validations (status, school_year, month);

alter table public.monthly_time_validations enable row level security;

revoke all on table public.monthly_time_validations from anon, authenticated;
grant select on table public.monthly_time_validations to authenticated;

create policy monthly_time_validations_select
on public.monthly_time_validations for select to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1
    from public.employees employee
    where employee.id = employee_id
      and employee.user_id = (select auth.uid())
  )
);

create or replace function private.flag_validated_event_month(
  p_calendar_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns void
language sql
security definer
set search_path = ''
as $$
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
  where p_starts_at is not null
    and p_ends_at is not null
    and p_ends_at > p_starts_at
    and employee.resource_calendar_id = p_calendar_id
    and employee.active
    and employee.contract_type = 'CDI'
    and validation.employee_id = employee.id
    and validation.school_year = extract(year from affected_month.local_month_start)::integer
      - case when extract(month from affected_month.local_month_start) < 9 then 1 else 0 end
    and validation.month = extract(month from affected_month.local_month_start)::integer;
$$;

revoke all on function private.flag_validated_event_month(uuid,timestamptz,timestamptz)
  from public, anon, authenticated;

create or replace function private.detect_validated_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and not (
    old.calendar_id is distinct from new.calendar_id
    or old.status is distinct from new.status
    or old.summary is distinct from new.summary
    or old.starts_at is distinct from new.starts_at
    or old.ends_at is distinct from new.ends_at
    or old.all_day is distinct from new.all_day
    or old.start_date is distinct from new.start_date
    or old.end_date is distinct from new.end_date
    or old.source_google_calendar_id is distinct from new.source_google_calendar_id
    or old.coefficient_rule_id is distinct from new.coefficient_rule_id
  ) then
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') and not old.all_day and old.status <> 'cancelled' then
    perform private.flag_validated_event_month(old.calendar_id, old.starts_at, old.ends_at);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and not new.all_day and new.status <> 'cancelled' then
    perform private.flag_validated_event_month(new.calendar_id, new.starts_at, new.ends_at);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.detect_validated_event_change() from public, anon, authenticated;

create trigger calendar_events_detect_validated_change
after insert or update or delete on public.calendar_events
for each row execute function private.detect_validated_event_change();

create or replace function public.validate_time_month(
  p_employee_id uuid,
  p_school_year integer,
  p_month integer
)
returns public.monthly_time_validations
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start date;
  validation public.monthly_time_validations;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentification requise';
  end if;
  if p_school_year not between 2000 and 2100 or p_month not between 1 and 12 then
    raise exception 'Période invalide';
  end if;

  month_start := make_date(
    case when p_month >= 9 then p_school_year else p_school_year + 1 end,
    p_month,
    1
  );
  if month_start + interval '1 month' > (current_timestamp at time zone 'Europe/Paris') then
    raise exception 'Seul un mois terminé peut être validé';
  end if;
  if not exists (
    select 1
    from public.employees employee
    where employee.id = p_employee_id
      and employee.user_id = (select auth.uid())
      and employee.active
      and employee.contract_type = 'CDI'
  ) then
    raise exception 'Validation réservée au salarié CDI concerné';
  end if;
  if exists (
    select 1
    from public.monthly_time_validations existing
    where existing.employee_id = p_employee_id
      and existing.school_year = p_school_year
      and existing.month = p_month
      and existing.status = 'changes_pending'
  ) then
    raise exception 'Une modification attend la validation administrateur';
  end if;

  insert into public.monthly_time_validations (
    employee_id, school_year, month, status, validated_at, validated_by,
    change_detected_at, change_count, approved_at, approved_by, updated_at
  ) values (
    p_employee_id, p_school_year, p_month, 'validated', now(), (select auth.uid()),
    null, 0, null, null, now()
  )
  on conflict (employee_id, school_year, month) do update
  set validated_at = excluded.validated_at,
      validated_by = excluded.validated_by,
      updated_at = now()
  returning * into validation;

  return validation;
end;
$$;

create or replace function public.approve_time_month_change(
  p_employee_id uuid,
  p_school_year integer,
  p_month integer
)
returns public.monthly_time_validations
language plpgsql
security definer
set search_path = ''
as $$
declare
  validation public.monthly_time_validations;
begin
  if not (select private.is_admin()) then
    raise exception 'Accès administrateur requis';
  end if;

  update public.monthly_time_validations existing
  set status = 'validated',
      change_detected_at = null,
      approved_at = now(),
      approved_by = (select auth.uid()),
      updated_at = now()
  where existing.employee_id = p_employee_id
    and existing.school_year = p_school_year
    and existing.month = p_month
    and existing.status = 'changes_pending'
  returning * into validation;

  if validation.employee_id is null then
    raise exception 'Aucune modification en attente pour cette période';
  end if;
  return validation;
end;
$$;

revoke all on function public.validate_time_month(uuid,integer,integer) from public, anon, authenticated;
revoke all on function public.approve_time_month_change(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.validate_time_month(uuid,integer,integer) to authenticated;
grant execute on function public.approve_time_month_change(uuid,integer,integer) to authenticated;

comment on table public.monthly_time_validations is
  'Employee CDI attestations for completed months. Relevant later calendar changes require administrator approval.';
