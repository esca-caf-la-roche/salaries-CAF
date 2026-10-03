-- Direct every validation task to its employee, school season and month.
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
  action_url text;
begin
  select display_name into employee_name from public.employees where id = p_employee_id;
  month_name := to_char(make_date(case when p_month >= 9 then p_school_year else p_school_year + 1 end, p_month, 1), 'TMMonth YYYY');
  action_url := '/suivi-heures?employee=' || p_employee_id || '&season=' || p_school_year || '&month=' || p_month;

  if p_event_type = 'employee_validated' then
    title_text := 'Mois validé par ' || employee_name;
    body_text := initcap(month_name) || ' attend votre contrôle.';
    insert into public.user_notifications (recipient_user_id, validation_event_id, title, body, action_url)
    select profile.id, p_event_id, title_text, body_text, action_url
    from public.profiles profile where profile.role = 'admin' and profile.active;

    select validation_alert_email into alert_email from public.app_settings where singleton;
    if alert_email is not null then
      insert into public.validation_email_outbox (validation_event_id, recipient_email, subject, body)
      values (p_event_id, alert_email, title_text, employee_name || ' a validé ' || initcap(month_name) || ' dans La Cordée.');
    end if;
  elsif p_event_type = 'source_changed' then
    title_text := 'Heures modifiées après validation';
    body_text := employee_name || ' · ' || initcap(month_name) || ' doit être contrôlé de nouveau.';
    insert into public.user_notifications (recipient_user_id, validation_event_id, title, body, action_url)
    select profile.id, p_event_id, title_text, body_text, action_url
    from public.profiles profile where profile.role = 'admin' and profile.active
    union
    select employee.user_id, p_event_id, title_text, body_text, action_url
    from public.employees employee where employee.id = p_employee_id and employee.user_id is not null;
  else
    title_text := 'Mois approuvé par l’administration';
    body_text := initcap(month_name) || ' a été approuvé.';
    insert into public.user_notifications (recipient_user_id, validation_event_id, title, body, action_url)
    select employee.user_id, p_event_id, title_text, body_text, action_url
    from public.employees employee where employee.id = p_employee_id and employee.user_id is not null;
  end if;
end;
$$;

-- Existing notifications become actionable too.
update public.user_notifications notification
set action_url = '/suivi-heures?employee=' || event.employee_id || '&season=' || event.school_year || '&month=' || event.month
from public.monthly_validation_events event
where notification.validation_event_id = event.id
  and notification.action_url = '/';

-- An administrator can explicitly sign off both a newly employee-validated month
-- and a month changed after validation.
create or replace function public.approve_time_month_change(p_employee_id uuid, p_school_year integer, p_month integer)
returns public.monthly_time_validations
language plpgsql security definer set search_path = ''
as $$
declare validation public.monthly_time_validations; history_id uuid;
begin
  if not (select private.is_admin()) then raise exception 'Accès administrateur requis'; end if;
  update public.monthly_time_validations existing
  set status = 'validated', change_detected_at = null, approved_at = now(), approved_by = (select auth.uid()), updated_at = now()
  where existing.employee_id = p_employee_id and existing.school_year = p_school_year and existing.month = p_month
    and (existing.status = 'changes_pending' or (existing.status = 'validated' and existing.approved_at is null))
  returning * into validation;
  if validation.employee_id is null then raise exception 'Aucune validation en attente pour cette période'; end if;
  insert into public.monthly_validation_events (employee_id, school_year, month, event_type, actor_id, change_count)
  values (p_employee_id, p_school_year, p_month, 'admin_approved', (select auth.uid()), validation.change_count) returning id into history_id;
  perform private.notify_validation_event(history_id, p_employee_id, p_school_year, p_month, 'admin_approved');
  return validation;
end;
$$;
