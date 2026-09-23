alter table public.employee_monthly_payroll
  add column bulk_recorded_at timestamptz;

comment on column public.employee_monthly_payroll.bulk_recorded_at is
  'Date when an administrator explicitly saved the month from the bulk payslip entry page.';
