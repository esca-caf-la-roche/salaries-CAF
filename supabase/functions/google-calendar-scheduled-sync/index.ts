import { handleScheduledSync } from "../_shared/scheduledSync.ts";
import { adminClient } from "../_shared/supabase.ts";
import { sync } from "../_shared/googleCalendarSync.ts";

Deno.serve((req) => handleScheduledSync(
  req,
  Deno.env.get("CALENDAR_SYNC_CRON_SECRET"),
  // Cron filters recent resources; an authenticated dispatch always attempts its
  // single resource, which also makes acceptance/recovery possible on demand.
  (calendarId) => sync(adminClient(), [calendarId], false, AbortSignal.timeout(80000)),
));
