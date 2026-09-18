alter table public.employees
  add column paid_months smallint not null default 12
  constraint employees_paid_months check (paid_months between 1 and 12);

create or replace function public.internal_configure_resources(
  p_connection_id uuid,
  p_updates jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  employee_id uuid;
  resource_id uuid;
  enabled_value boolean;
  login_email text;
  contract_text text;
  contract_value public.contract_type;
  annual_hours_value numeric;
  paid_months_value smallint;
  special_resource boolean;
  previous_user_id uuid;
  next_user_id uuid;
begin
  if jsonb_typeof(p_updates) <> 'array' then
    raise exception 'Liste de ressources invalide';
  end if;

  for item in select value from jsonb_array_elements(p_updates)
  loop
    employee_id := (item ->> 'id')::uuid;

    select c.id, e.is_unassigned_resource
    into resource_id, special_resource
    from public.employees e
    join public.calendars c on c.id = e.resource_calendar_id
    where e.id = employee_id and c.connection_id = p_connection_id and c.is_resource;

    if resource_id is null then raise exception 'Ressource Google inconnue'; end if;

    enabled_value := coalesce((item ->> 'enabled')::boolean, false);
    login_email := nullif(lower(trim(item ->> 'loginEmail')), '');
    contract_text := nullif(upper(trim(item ->> 'contractType')), '');
    annual_hours_value := nullif(item ->> 'annualContractHours', '')::numeric;
    paid_months_value := coalesce(nullif(item ->> 'paidMonths', '')::smallint, 12);
    next_user_id := nullif(item ->> 'userId', '')::uuid;

    if special_resource then
      enabled_value := true; login_email := null; contract_value := null;
      annual_hours_value := null; paid_months_value := 12; next_user_id := null;
    else
      if contract_text is not null and contract_text not in ('CDI', 'CDII', 'CDD', 'INDEP') then
        raise exception 'Type de contrat invalide : choisissez CDI, CDII, CDD ou Indépendant';
      end if;
      contract_value := contract_text::public.contract_type;
      if paid_months_value not between 1 and 12 then
        raise exception 'Le nombre de mois de paiement doit être compris entre 1 et 12';
      end if;
      if enabled_value and (login_email is null or login_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
        raise exception 'Un e-mail valide est requis pour chaque ressource suivie';
      end if;
      if enabled_value and (contract_value is null or (contract_value <> 'INDEP' and (annual_hours_value is null or annual_hours_value <= 0))) then
        raise exception 'Le type de contrat et un nombre d''heures annuelles positif sont requis';
      end if;
    end if;

    select user_id into previous_user_id from public.employees where id = employee_id;
    update public.employees set active = enabled_value, email = login_email, user_id = next_user_id,
      contract_type = contract_value, annual_contract_hours = annual_hours_value, paid_months = paid_months_value
    where id = employee_id;
    update public.calendars set enabled = enabled_value where id = resource_id;
    if next_user_id is not null then update public.profiles set active = true where id = next_user_id and role = 'employee'; end if;
    if previous_user_id is not null and previous_user_id is distinct from next_user_id then
      update public.profiles p set active = false where p.id = previous_user_id and p.role = 'employee'
        and not exists (select 1 from public.employees active_employee where active_employee.user_id = previous_user_id and active_employee.active);
    end if;
  end loop;
end;
$$;

revoke all on function public.internal_configure_resources(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.internal_configure_resources(uuid,jsonb) to service_role;
