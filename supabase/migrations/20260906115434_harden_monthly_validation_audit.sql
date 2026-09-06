alter table public.monthly_time_validations
  alter column validated_by drop not null,
  drop constraint monthly_time_validations_validated_by_fkey,
  add constraint monthly_time_validations_validated_by_fkey
    foreign key (validated_by) references auth.users(id) on delete set null,
  drop constraint monthly_time_validations_approved_by_fkey,
  add constraint monthly_time_validations_approved_by_fkey
    foreign key (approved_by) references auth.users(id) on delete set null;

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

  if tg_op in ('UPDATE', 'DELETE') and not old.all_day and old.status is distinct from 'cancelled' then
    perform private.flag_validated_event_month(old.calendar_id, old.starts_at, old.ends_at);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and not new.all_day and new.status is distinct from 'cancelled' then
    perform private.flag_validated_event_month(new.calendar_id, new.starts_at, new.ends_at);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.detect_validated_event_change() from public, anon, authenticated;
