drop policy employee_school_year_settings_admin_all
  on public.employee_school_year_settings;
drop policy employee_school_year_settings_self_select
  on public.employee_school_year_settings;

create policy employee_school_year_settings_select
on public.employee_school_year_settings for select to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1 from public.employees e
    where e.id = employee_id and e.user_id = (select auth.uid())
  )
);

create policy employee_school_year_settings_admin_insert
on public.employee_school_year_settings for insert to authenticated
with check ((select private.is_admin()));

create policy employee_school_year_settings_admin_update
on public.employee_school_year_settings for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy employee_school_year_settings_admin_delete
on public.employee_school_year_settings for delete to authenticated
using ((select private.is_admin()));

drop policy employee_monthly_payroll_admin_all
  on public.employee_monthly_payroll;
drop policy employee_monthly_payroll_self_select
  on public.employee_monthly_payroll;

create policy employee_monthly_payroll_select
on public.employee_monthly_payroll for select to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1 from public.employees e
    where e.id = employee_id and e.user_id = (select auth.uid())
  )
);

create policy employee_monthly_payroll_admin_insert
on public.employee_monthly_payroll for insert to authenticated
with check ((select private.is_admin()));

create policy employee_monthly_payroll_admin_update
on public.employee_monthly_payroll for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy employee_monthly_payroll_admin_delete
on public.employee_monthly_payroll for delete to authenticated
using ((select private.is_admin()));
