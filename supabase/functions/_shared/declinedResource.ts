// A failed or incomplete Google read must never silently dismiss an alert.
export async function isResourceStillDeclined(
  read: () => Promise<Response>,
  resourceEmail: string,
): Promise<boolean> {
  try {
    const response = await read();
    if (!response.ok) return true;
    const event = await response.json();
    if (event.status === "cancelled") return false;
    if (!Array.isArray(event.attendees) || event.attendeesOmitted) return true;
    const attendee = event.attendees.find((item: { email?: string }) =>
      item.email?.trim().toLowerCase() === resourceEmail.trim().toLowerCase());
    return attendee ? attendee.responseStatus !== "accepted" : false;
  } catch {
    return true;
  }
}

export type CachedRefusal = { calendarId: string; eventId: string; organizer?: string };

export async function cachedRefusalRevision(raw: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(raw));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Only read Google: no calendar writes or automatic repairs.
export async function verifyCachedRefusals<T extends CachedRefusal>(
  candidates: T[],
  getToken: (signal: AbortSignal) => Promise<string>,
  request: typeof fetch = fetch,
  now: () => number = Date.now,
  rememberResolved: (candidate: T) => Promise<boolean> = async () => true,
): Promise<T[]> {
  if (!candidates.length) return candidates;
  const deadline = now() + 8_000;
  let token: string;
  try { token = await getToken(AbortSignal.timeout(8_000)); }
  catch { return candidates; }
  const resolved = new Set<T>();
  // Rotate bounded windows so persistently declined events cannot starve others.
  // Advance by one, not the nominal batch size: even a truncated batch must
  // eventually start at every candidate (independent of array length).
  const offset = Math.floor(now() / 60_000) % candidates.length;
  for (let index = 0; index < Math.min(20, candidates.length); index++) {
    const remaining = deadline - now();
    if (remaining <= 0) break;
    const candidate = candidates[(offset + index) % candidates.length];
    const signal = AbortSignal.timeout(Math.min(2_000, remaining));
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(candidate.organizer || candidate.calendarId)}/events/${encodeURIComponent(candidate.eventId)}`);
    const declined = await isResourceStillDeclined(() => request(url, {
      signal,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    }), candidate.calendarId);
    if (!declined) {
      try { if (await rememberResolved(candidate)) resolved.add(candidate); }
      catch { /* Keep the alert if durable reconciliation failed. */ }
    }
  }
  return candidates.filter((candidate) => !resolved.has(candidate));
}
