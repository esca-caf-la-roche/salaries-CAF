-- Run manually on the linked project AFTER deploying and applying the migration.
-- Leaves the job inactive and dispatches its real Vault-authenticated requests.
-- Inspect net._http_response and sync_runs after this transaction commits.
do $$
declare
  job_command text;
begin
  if (select count(*) from cron.job where jobname = 'daily-google-calendar-sync') <> 1 then
    raise exception 'Expected exactly one calendar sync job';
  end if;
  if (select count(*) from public.google_connections where revoked_at is null) <> 1 then
    raise exception 'Expected exactly one shared Google connection';
  end if;
  if exists (select 1 from cron.job where jobname = 'daily-google-calendar-sync' and active) then
    raise exception 'Disable the job before running acceptance checks';
  end if;
  select command into job_command from cron.job where jobname = 'daily-google-calendar-sync';
  execute job_command;
end $$;

-- Explicit acceptance dispatch also exercises real Google sync when all resources
-- are already fresh (the cron command correctly dispatches nothing in that case).
select c.id as calendar_id, net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'calendar_sync_project_url')
    || '/functions/v1/google-calendar-scheduled-sync',
  headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
    'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'calendar_sync_cron_secret')),
  body := jsonb_build_object('calendarId', c.id), timeout_milliseconds := 120000
) as request_id
from public.calendars c join public.google_connections g on g.id = c.connection_id
where c.enabled and c.is_resource and g.revoked_at is null;

-- Authenticated malformed input must return HTTP 400, not trigger a global sync.
select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'calendar_sync_project_url')
    || '/functions/v1/google-calendar-scheduled-sync',
  headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
    'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'calendar_sync_cron_secret')),
  body := '{}'::jsonb, timeout_milliseconds := 120000
) as malformed_request_id;
