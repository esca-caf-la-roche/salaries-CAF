create table public.employee_school_year_settings (
  employee_id uuid not null references public.employees(id) on delete cascade,
  school_year integer not null,
  contract_type public.contract_type not null,
  annual_contract_minutes integer not null,
  full_time_annual_minutes integer not null default 94920,
  paid_months smallint not null default 12,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (employee_id, school_year),
  constraint employee_school_year_settings_year
    check (school_year between 2000 and 2100),
  constraint employee_school_year_settings_contract_minutes
    check (annual_contract_minutes > 0),
  constraint employee_school_year_settings_full_time_minutes
    check (full_time_annual_minutes > 0),
  constraint employee_school_year_settings_paid_months
    check (paid_months between 1 and 12)
);

create table public.employee_monthly_payroll (
  employee_id uuid not null references public.employees(id) on delete cascade,
  school_year integer not null,
  month smallint not null,
  paid_minutes integer not null default 0,
  paid_leave_minutes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (employee_id, school_year, month),
  constraint employee_monthly_payroll_year
    check (school_year between 2000 and 2100),
  constraint employee_monthly_payroll_month
    check (month between 1 and 12),
  constraint employee_monthly_payroll_paid_minutes
    check (paid_minutes >= 0),
  constraint employee_monthly_payroll_paid_leave_minutes
    check (paid_leave_minutes >= 0)
);

create index employee_school_year_settings_school_year_idx
  on public.employee_school_year_settings (school_year, employee_id);
create index employee_monthly_payroll_school_year_idx
  on public.employee_monthly_payroll (school_year, employee_id);

create trigger employee_school_year_settings_set_updated_at
before update on public.employee_school_year_settings
for each row execute function private.set_updated_at();

create trigger employee_monthly_payroll_set_updated_at
before update on public.employee_monthly_payroll
for each row execute function private.set_updated_at();

alter table public.employee_school_year_settings enable row level security;
alter table public.employee_monthly_payroll enable row level security;

create policy employee_school_year_settings_admin_all
on public.employee_school_year_settings for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy employee_school_year_settings_self_select
on public.employee_school_year_settings for select to authenticated
using (exists (
  select 1 from public.employees e
  where e.id = employee_id and e.user_id = (select auth.uid())
));

create policy employee_monthly_payroll_admin_all
on public.employee_monthly_payroll for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy employee_monthly_payroll_self_select
on public.employee_monthly_payroll for select to authenticated
using (exists (
  select 1 from public.employees e
  where e.id = employee_id and e.user_id = (select auth.uid())
));

revoke all on public.employee_school_year_settings from public, anon;
revoke all on public.employee_monthly_payroll from public, anon;
grant select, insert, update, delete on public.employee_school_year_settings to authenticated;
grant select, insert, update, delete on public.employee_monthly_payroll to authenticated;

drop view public.monthly_hours;

create view public.monthly_hours
with (security_invoker = true)
as
with event_month_slices as (
  select
    e.id as employee_id,
    e.display_name as employee_name,
    cr.label as calendar_name,
    ce.id as event_id,
    month_slice.local_month_start::date as month_start,
    to_char(
      greatest(
        ce.starts_at,
        month_slice.local_month_start at time zone 'Europe/Paris'
      ) at time zone 'Europe/Paris',
      'IYYY-IW'
    ) as iso_week,
    extract(epoch from (
      least(
        ce.ends_at,
        (month_slice.local_month_start + interval '1 month') at time zone 'Europe/Paris'
      )
      - greatest(
        ce.starts_at,
        month_slice.local_month_start at time zone 'Europe/Paris'
      )
    )) / 3600.0 as elapsed_hours,
    cr.coefficient,
    cr.hour_category
  from public.calendar_events ce
  join public.calendars resource_calendar on resource_calendar.id = ce.calendar_id
  join public.employees e on e.resource_calendar_id = resource_calendar.id
  join public.coefficient_rules cr
    on lower(trim(cr.google_calendar_id)) = lower(trim(ce.source_google_calendar_id))
    and cr.active
    and cr.hour_category is not null
  cross join lateral generate_series(
    date_trunc('month', ce.starts_at at time zone 'Europe/Paris'),
    date_trunc('month', (ce.ends_at - interval '1 microsecond') at time zone 'Europe/Paris'),
    interval '1 month'
  ) as month_slice(local_month_start)
  where ce.status <> 'cancelled'
    and resource_calendar.enabled
    and resource_calendar.is_resource
    and e.active
    and not ce.all_day
)
select
  employee_id,
  employee_name,
  string_agg(distinct calendar_name, ', ' order by calendar_name) as calendar_name,
  extract(year from month_start)::integer
    - case when extract(month from month_start) < 9 then 1 else 0 end as school_year,
  extract(year from month_start)::integer as year,
  extract(month from month_start)::integer as month,
  round(sum(elapsed_hours)::numeric, 2) as raw_hours,
  round(sum(elapsed_hours * coefficient)::numeric, 2) as weighted_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'contract'
  ), 0)::numeric, 2) as contract_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'absence'
  ), 0)::numeric, 2) as absence_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'replacement'
  ), 0)::numeric, 2) as replacement_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'public_holiday'
  ), 0)::numeric, 2) as public_holiday_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'contract' and coefficient = 1.25
  ), 0)::numeric, 2) as contract_with_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'contract' and coefficient = 1
  ), 0)::numeric, 2) as contract_without_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'absence' and coefficient = 1.25
  ), 0)::numeric, 2) as absence_with_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'absence' and coefficient = 1
  ), 0)::numeric, 2) as absence_without_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'replacement' and coefficient = 1.25
  ), 0)::numeric, 2) as replacement_with_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'replacement' and coefficient = 1
  ), 0)::numeric, 2) as replacement_without_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'public_holiday' and coefficient = 1.25
  ), 0)::numeric, 2) as public_holiday_with_prep_hours,
  round(coalesce(sum(elapsed_hours * coefficient) filter (
    where hour_category = 'public_holiday' and coefficient = 1
  ), 0)::numeric, 2) as public_holiday_without_prep_hours,
  count(distinct iso_week) filter (where hour_category = 'contract')::integer as worked_weeks,
  count(distinct event_id)::bigint as event_count
from event_month_slices
group by employee_id, employee_name, month_start;

revoke all on public.monthly_hours from public, anon;
grant select on public.monthly_hours to authenticated;

create view public.monthly_event_hours
with (security_invoker = true)
as
select
  ce.id as event_id,
  e.id as employee_id,
  e.display_name as employee_name,
  extract(year from month_slice.local_month_start)::integer
    - case when extract(month from month_slice.local_month_start) < 9 then 1 else 0 end as school_year,
  extract(month from month_slice.local_month_start)::integer as month,
  ce.summary as title,
  cr.label as calendar_name,
  cr.color as calendar_color,
  greatest(
    ce.starts_at,
    month_slice.local_month_start at time zone 'Europe/Paris'
  ) as starts_at,
  least(
    ce.ends_at,
    (month_slice.local_month_start + interval '1 month') at time zone 'Europe/Paris'
  ) as ends_at,
  round((extract(epoch from (
    least(ce.ends_at, (month_slice.local_month_start + interval '1 month') at time zone 'Europe/Paris')
    - greatest(ce.starts_at, month_slice.local_month_start at time zone 'Europe/Paris')
  )) / 3600.0)::numeric, 2) as raw_hours,
  round((extract(epoch from (
    least(ce.ends_at, (month_slice.local_month_start + interval '1 month') at time zone 'Europe/Paris')
    - greatest(ce.starts_at, month_slice.local_month_start at time zone 'Europe/Paris')
  )) / 3600.0 * cr.coefficient)::numeric, 2) as weighted_hours,
  cr.coefficient,
  cr.hour_category,
  (cr.coefficient = 1.25) as has_preparation
from public.calendar_events ce
join public.calendars resource_calendar on resource_calendar.id = ce.calendar_id
join public.employees e on e.resource_calendar_id = resource_calendar.id
join public.coefficient_rules cr
  on lower(trim(cr.google_calendar_id)) = lower(trim(ce.source_google_calendar_id))
  and cr.active
  and cr.hour_category is not null
cross join lateral generate_series(
  date_trunc('month', ce.starts_at at time zone 'Europe/Paris'),
  date_trunc('month', (ce.ends_at - interval '1 microsecond') at time zone 'Europe/Paris'),
  interval '1 month'
) as month_slice(local_month_start)
where ce.status <> 'cancelled'
  and resource_calendar.enabled
  and resource_calendar.is_resource
  and e.active
  and not ce.all_day;

revoke all on public.monthly_event_hours from public, anon;
grant select on public.monthly_event_hours to authenticated;

create view public.employee_school_year_weeks
with (security_invoker = true)
as
select
  e.id as employee_id,
  extract(year from ce.starts_at at time zone 'Europe/Paris')::integer
    - case when extract(month from ce.starts_at at time zone 'Europe/Paris') < 9 then 1 else 0 end as school_year,
  count(distinct to_char(ce.starts_at at time zone 'Europe/Paris', 'IYYY-IW'))::integer as worked_weeks
from public.calendar_events ce
join public.calendars resource_calendar on resource_calendar.id = ce.calendar_id
join public.employees e on e.resource_calendar_id = resource_calendar.id
join public.coefficient_rules cr
  on lower(trim(cr.google_calendar_id)) = lower(trim(ce.source_google_calendar_id))
  and cr.active
  and cr.hour_category = 'contract'
where ce.status <> 'cancelled'
  and resource_calendar.enabled
  and resource_calendar.is_resource
  and e.active
  and not ce.all_day
group by e.id,
  extract(year from ce.starts_at at time zone 'Europe/Paris')::integer
    - case when extract(month from ce.starts_at at time zone 'Europe/Paris') < 9 then 1 else 0 end;

revoke all on public.employee_school_year_weeks from public, anon;
grant select on public.employee_school_year_weeks to authenticated;

comment on table public.employee_school_year_settings is
  'Immutable-by-season contract snapshot and CDI full-time reference used for annual regularisation.';
comment on table public.employee_monthly_payroll is
  'Monthly paid hours copied from salary statements. Values are stored as whole minutes.';
comment on view public.monthly_hours is
  'Configured hours grouped by employee and school month, including preparation splits and distinct worked ISO weeks.';
comment on view public.monthly_event_hours is
  'Event-level monthly detail for the spreadsheet-like control screen. RLS follows the underlying employee calendar data.';
comment on view public.employee_school_year_weeks is
  'Distinct ISO weeks with contract activity across the whole school season, avoiding double counts at month boundaries.';
