// Google does not publish a resource-booking propagation SLA. These delays are
// a bounded retry policy, not a promise that a resource is released after N ms.
export type BookingEvent = {
  id: string;
  attendees?: Array<{ email?: string; responseStatus?: string }>;
};
type BookingOptions = {
  resourceId: string;
  // Date-only events skip freeBusy rather than guess a UTC offset for Paris.
  timeMin?: string;
  timeMax?: string;
  deadline: number;
  create: () => Promise<BookingEvent>;
  eventUrl: (id: string) => URL;
  request: (url: URL, method: "GET" | "POST", body: unknown, signal: AbortSignal) => Promise<Record<string, unknown>>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const normalize = (email?: string) => (email ?? "").trim().toLowerCase();

export async function createReplacementBooking(options: BookingOptions) {
  const { resourceId, timeMin, timeMax, deadline, create, eventUrl, request } = options;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const pause = async (ms: number) => {
    if (now() + ms >= deadline) return false;
    if (ms) await sleep(ms);
    return now() < deadline;
  };
  const signal = () => AbortSignal.timeout(Math.max(1, Math.min(2000, deadline - now())));
  let advisoryError = false;

  // The caller has awaited removal from the original event. Poll availability
  // briefly to let Google reflect that change. Busy/error/budget exhaustion must
  // NEVER stop assignment: a declined attendee is tracked by the overview.
  if (timeMin && timeMax) {
    try {
      for (const delay of [0, 400, 1000]) {
        if (!await pause(delay)) break;
        const result = await request(new URL("https://www.googleapis.com/calendar/v3/freeBusy"), "POST", {
          timeMin, timeMax, timeZone: "Europe/Paris", items: [{ id: resourceId }],
        }, signal());
        const calendar = (result.calendars as Record<string, { busy?: unknown[]; errors?: unknown[] }> | undefined)?.[resourceId];
        if (!calendar || calendar.errors?.length || !Array.isArray(calendar.busy)) {
          advisoryError = true;
          break;
        }
        if (calendar.busy.length === 0) break;
      }
    } catch { advisoryError = true; }
  }

  const created = await create(); // Exactly once, always WITH the chosen resource.
  let current = created;
  const status = () => current.attendees?.find((item) => normalize(item.email) === normalize(resourceId))?.responseStatus;
  try {
    for (const delay of [400, 1000]) {
      if (status() === "accepted" || !await pause(delay)) break;
      current = await request(eventUrl(created.id), "GET", undefined, signal()) as unknown as BookingEvent;
    }
  } catch { advisoryError = true; }

  if (status() === "accepted" && !advisoryError) return { event: created, bookingWarning: null };
  const message = status() === "accepted"
    ? "Ressource acceptée par Google, mais le contrôle préalable de disponibilité a été incomplet."
    : "Remplacement créé avec sa ressource ; acceptation Google non confirmée. Vérifiez les notifications de la vue d’ensemble.";
  // Do not detach/re-add automatically: an outage between those writes would
  // leave no resource for the existing declined-attendee safeguard to detect.
  return { event: created, bookingWarning: `${message} Événement : ${created.id}. Ne recréez pas le remplacement.` };
}
