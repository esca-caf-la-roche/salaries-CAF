-- Provision CALENDAR_SYNC_CRON_SECRET in Edge secrets and calendar_sync_cron_secret
-- in Vault before applying. Never put the secret in migrations or cron.job.
-- This migration is intentionally restricted to this production project.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets
    where name = 'calendar_sync_project_url'
      and decrypted_secret = 'https://ucopmjqryaktcafgczpp.supabase.co') then
    raise exception 'Provision calendar_sync_project_url for the intended CAF project';
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'calendar_sync_cron_secret' and length(decrypted_secret) >= 32
  ) then
    raise exception 'Provision calendar_sync_cron_secret in Vault before scheduling';
  end if;
end $$;

-- Named scheduling updates an existing job: reapplying cannot create duplicates.
select cron.schedule(
  'daily-google-calendar-sync',
  '17,37 4 * * *', -- Daily at 04:17 UTC, retry stale resources at 04:37.
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
      where name = 'calendar_sync_project_url') || '/functions/v1/google-calendar-scheduled-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'calendar_sync_cron_secret'
      )
    ),
    body := jsonb_build_object('calendarId', c.id),
    timeout_milliseconds := 120000
  ) from public.calendars c
  join public.google_connections g on g.id = c.connection_id
  where c.enabled and c.is_resource and g.revoked_at is null
    and (c.last_synced_at is null or c.last_synced_at < now() - interval '1 hour');
  $job$
);

-- Keep inactive until the Vault -> Edge -> Google acceptance check passes.
select cron.alter_job(job_id := jobid, active := false)
from cron.job where jobname = 'daily-google-calendar-sync';
