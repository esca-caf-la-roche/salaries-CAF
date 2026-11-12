-- A successful read of the organizer resolves only this exact cached snapshot.
-- Normal synchronization replaces raw; a changed snapshot becomes eligible again.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

alter table public.calendar_events
  add column if not exists resource_decline_resolved_revision text;

comment on column public.calendar_events.resource_decline_resolved_revision is
  'SHA-256 of the cached Google raw snapshot verified resolved on the organizer; no change to hours or Google events.';

commit;
