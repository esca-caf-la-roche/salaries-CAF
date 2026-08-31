create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum ('admin', 'employee');
create type public.sync_status as enum ('idle', 'running', 'success', 'error');
create type public.allocation_mode as enum ('EACH', 'SPLIT', 'PERCENT');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role public.app_role not null default 'employee',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.google_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  google_account_email text,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

create table private.google_credentials (
  connection_id uuid primary key references public.google_connections(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  token_type text not null default 'Bearer',
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table private.google_credentials enable row level security;
revoke all on private.google_credentials from public, anon, authenticated;

create table public.google_oauth_states (
  state_hash text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  redirect_to text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint google_oauth_states_future_expiry check (expires_at > created_at)
);

create table public.coefficient_rules (
  id uuid primary key default gen_random_uuid(),
  google_calendar_id text not null unique,
  label text not null,
  coefficient numeric(8,4) not null default 1,
  report_column text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coefficient_rules_positive check (coefficient >= 0)
);

create table public.calendars (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.google_connections(id) on delete cascade,
  google_calendar_id text not null,
  name text not null,
  description text,
  time_zone text,
  access_role text,
  color text,
  is_primary boolean not null default false,
  enabled boolean not null default false,
  coefficient_rule_id uuid references public.coefficient_rules(id) on delete set null,
  coefficient numeric(8,4) not null default 1,
  sync_token text,
  sync_status public.sync_status not null default 'idle',
  sync_error text,
  sync_started_at timestamptz,
  last_synced_at timestamptz,
  event_count bigint not null default 0 check (event_count >= 0),
  sync_lock_expires_at timestamptz,
  last_discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendars_connection_google_unique unique (connection_id, google_calendar_id),
  constraint calendars_coefficient_positive check (coefficient >= 0)
);

create table public.calendar_employee_assignments (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  allocation_mode public.allocation_mode not null default 'EACH',
  allocation_percent numeric(7,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_employee_assignment_unique unique (calendar_id, employee_id),
  constraint calendar_employee_assignment_percent check (
    (allocation_mode = 'PERCENT' and allocation_percent > 0 and allocation_percent <= 100)
    or (allocation_mode <> 'PERCENT' and allocation_percent is null)
  )
);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  mode text not null check (mode in ('full', 'incremental')),
  status text not null default 'running' check (status in ('running', 'success', 'error')),
  pages_fetched integer not null default 0 check (pages_fetched >= 0),
  events_seen integer not null default 0 check (events_seen >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  google_event_id text not null,
  status text not null default 'confirmed',
  summary text,
  description text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  start_date date,
  end_date date,
  all_day boolean not null default false,
  recurring_event_id text,
  original_start_time text,
  google_updated_at timestamptz,
  etag text,
  raw jsonb not null default '{}'::jsonb,
  last_seen_sync_run_id uuid references public.sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_calendar_google_unique unique (calendar_id, google_event_id),
  constraint calendar_events_time_shape check (
    (all_day and start_date is not null and end_date is not null and starts_at is null and ends_at is null)
    or
    (not all_day and starts_at is not null and ends_at is not null and start_date is null and end_date is null)
  ),
  constraint calendar_events_valid_range check (
    (all_day and end_date >= start_date) or (not all_day and ends_at >= starts_at)
  )
);

create index employees_user_id_idx on public.employees(user_id) where user_id is not null;
create index calendars_connection_enabled_idx on public.calendars(connection_id, enabled);
create index calendars_rule_id_idx on public.calendars(coefficient_rule_id) where coefficient_rule_id is not null;
create index calendar_employee_assignments_employee_idx on public.calendar_employee_assignments(employee_id, calendar_id);
create index calendar_events_calendar_start_idx on public.calendar_events(calendar_id, starts_at) where not all_day;
create index calendar_events_calendar_date_idx on public.calendar_events(calendar_id, start_date) where all_day;
create index calendar_events_last_seen_idx on public.calendar_events(last_seen_sync_run_id);
create index sync_runs_calendar_started_idx on public.sync_runs(calendar_id, started_at desc);
create index oauth_states_expiry_idx on public.google_oauth_states(expires_at) where used_at is null;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger employees_set_updated_at before update on public.employees for each row execute function private.set_updated_at();
create trigger google_connections_set_updated_at before update on public.google_connections for each row execute function private.set_updated_at();
create trigger coefficient_rules_set_updated_at before update on public.coefficient_rules for each row execute function private.set_updated_at();
create trigger calendars_set_updated_at before update on public.calendars for each row execute function private.set_updated_at();
create trigger calendar_employee_assignments_set_updated_at before update on public.calendar_employee_assignments for each row execute function private.set_updated_at();
create trigger calendar_events_set_updated_at before update on public.calendar_events for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    case
      when lower(trim(coalesce(new.email, ''))) = 'escalade@caflarochebonnevile.fr' then 'admin'::public.app_role
      else 'employee'::public.app_role
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

insert into public.profiles (id, email, display_name, role)
select
  id,
  coalesce(email, ''),
  coalesce(raw_user_meta_data ->> 'full_name', email),
  case
    when lower(trim(coalesce(email, ''))) = 'escalade@caflarochebonnevile.fr' then 'admin'::public.app_role
    else 'employee'::public.app_role
  end
from auth.users
on conflict (id) do update set
  email = excluded.email,
  role = case
    when lower(trim(excluded.email)) = 'escalade@caflarochebonnevile.fr' then 'admin'::public.app_role
    else public.profiles.role
  end;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and active
  );
$$;
revoke execute on function private.is_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

create or replace function public.internal_upsert_google_credentials(
  p_connection_id uuid,
  p_access_token text,
  p_refresh_token text,
  p_token_type text,
  p_expires_at timestamptz
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.google_credentials (connection_id, access_token, refresh_token, token_type, expires_at)
  values (p_connection_id, p_access_token, p_refresh_token, coalesce(p_token_type, 'Bearer'), p_expires_at)
  on conflict (connection_id) do update set
    access_token = excluded.access_token,
    refresh_token = coalesce(excluded.refresh_token, private.google_credentials.refresh_token),
    token_type = excluded.token_type,
    expires_at = excluded.expires_at,
    updated_at = now();
$$;

create or replace function public.internal_get_google_credentials(p_connection_id uuid)
returns table(access_token text, refresh_token text, token_type text, expires_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select c.access_token, c.refresh_token, c.token_type, c.expires_at
  from private.google_credentials c
  where c.connection_id = p_connection_id;
$$;
revoke all on function public.internal_upsert_google_credentials(uuid,text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.internal_get_google_credentials(uuid) from public, anon, authenticated;
grant execute on function public.internal_upsert_google_credentials(uuid,text,text,text,timestamptz) to service_role;
grant execute on function public.internal_get_google_credentials(uuid) to service_role;

alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.google_connections enable row level security;
alter table public.google_oauth_states enable row level security;
alter table public.coefficient_rules enable row level security;
alter table public.calendars enable row level security;
alter table public.calendar_employee_assignments enable row level security;
alter table public.sync_runs enable row level security;
alter table public.calendar_events enable row level security;

create policy profiles_select_self_or_admin on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_admin_update on public.profiles for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

create policy employees_admin_all on public.employees for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy employees_select_self on public.employees for select to authenticated
using (user_id = (select auth.uid()));

create policy google_connections_admin_all on public.google_connections for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy coefficient_rules_admin_all on public.coefficient_rules for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy calendars_admin_all on public.calendars for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy calendars_employee_select on public.calendars for select to authenticated
using (exists (
  select 1 from public.calendar_employee_assignments a
  join public.employees e on e.id = a.employee_id
  where a.calendar_id = calendars.id and e.user_id = (select auth.uid())
));
create policy calendar_employee_assignments_admin_all on public.calendar_employee_assignments for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy calendar_employee_assignments_self_select on public.calendar_employee_assignments for select to authenticated
using (exists (select 1 from public.employees e where e.id = employee_id and e.user_id = (select auth.uid())));
create policy sync_runs_admin_select on public.sync_runs for select to authenticated
using ((select private.is_admin()));
create policy calendar_events_admin_all on public.calendar_events for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy calendar_events_employee_select on public.calendar_events for select to authenticated
using (exists (
  select 1 from public.calendars c
  join public.calendar_employee_assignments a on a.calendar_id = c.id
  join public.employees e on e.id = a.employee_id
  where c.id = calendar_events.calendar_id and e.user_id = (select auth.uid())
));

grant usage on schema public to authenticated;
grant select on public.profiles, public.employees, public.google_connections, public.coefficient_rules,
  public.calendars, public.sync_runs, public.calendar_events to authenticated;
grant update on public.profiles to authenticated;
grant insert, update, delete on public.employees, public.google_connections, public.coefficient_rules,
  public.calendars, public.calendar_employee_assignments, public.calendar_events to authenticated;
grant select on public.calendar_employee_assignments to authenticated;
revoke all on public.google_oauth_states from public, anon, authenticated;

create or replace view public.monthly_hours
with (security_invoker = true)
as
with event_month_slices as (
  select
    a.employee_id,
    e.display_name as employee_name,
    c.name as calendar_name,
    ce.id as event_id,
    month_slice.local_month_start::date as month_start,
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
    c.coefficient,
    case a.allocation_mode
      when 'EACH' then 1
      when 'PERCENT' then a.allocation_percent / 100.0
      when 'SPLIT' then 1.0 / nullif(split_counts.assignment_count, 0)
    end as allocation_factor
  from public.calendar_events ce
  join public.calendars c on c.id = ce.calendar_id
  join public.calendar_employee_assignments a on a.calendar_id = c.id
  join public.employees e on e.id = a.employee_id
  cross join lateral generate_series(
    date_trunc('month', ce.starts_at at time zone 'Europe/Paris'),
    date_trunc('month', (ce.ends_at - interval '1 microsecond') at time zone 'Europe/Paris'),
    interval '1 month'
  ) as month_slice(local_month_start)
  left join lateral (
    select count(*)::numeric as assignment_count
    from public.calendar_employee_assignments split_assignment
    where split_assignment.calendar_id = c.id and split_assignment.allocation_mode = 'SPLIT'
  ) split_counts on true
  where ce.status <> 'cancelled' and c.enabled and not ce.all_day
)
select
  employee_id,
  employee_name,
  string_agg(distinct calendar_name, ', ' order by calendar_name) as calendar_name,
  extract(year from month_start)::integer as year,
  extract(month from month_start)::integer as month,
  round(sum(elapsed_hours * allocation_factor)::numeric, 2) as raw_hours,
  round(sum(elapsed_hours * allocation_factor * coefficient)::numeric, 2) as weighted_hours,
  count(distinct event_id)::bigint as event_count
from event_month_slices
group by employee_id, employee_name, month_start;
grant select on public.monthly_hours to authenticated;

comment on table private.google_credentials is 'Server-only Google OAuth tokens. Access exclusively through service_role-only internal RPCs.';
comment on view public.monthly_hours is 'Timed event duration is split at Europe/Paris month boundaries. All-day events are excluded. EACH gives 100%, SPLIT divides equally among SPLIT assignments, PERCENT applies the explicit percentage.';
