alter table public.employee_monthly_payroll
  add column paid_hundredth_hours integer not null default 0,
  add column paid_leave_hundredth_hours integer not null default 0,
  add column sick_leave_hundredth_hours integer not null default 0,
  add constraint employee_monthly_payroll_paid_hundredth_hours
    check (paid_hundredth_hours >= 0),
  add constraint employee_monthly_payroll_paid_leave_hundredth_hours
    check (paid_leave_hundredth_hours >= 0),
  add constraint employee_monthly_payroll_sick_leave_hundredth_hours
    check (sick_leave_hundredth_hours >= 0);

update public.employee_monthly_payroll
set
  paid_hundredth_hours = round(paid_minutes * 100.0 / 60.0),
  paid_leave_hundredth_hours = round(paid_leave_minutes * 100.0 / 60.0);

comment on column public.employee_monthly_payroll.paid_hundredth_hours is
  'Monthly payroll hours entered by administrators, stored as integer hundredths of an hour.';

comment on column public.employee_monthly_payroll.paid_leave_hundredth_hours is
  'Monthly paid-leave hours entered by administrators, stored as integer hundredths of an hour.';

comment on column public.employee_monthly_payroll.sick_leave_hundredth_hours is
  'Monthly sick-leave hours entered by administrators in hundredths of an hour and counted as annual worked time.';
