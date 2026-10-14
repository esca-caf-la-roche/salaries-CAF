type SyncResult = { results: Record<string, unknown>[] };

// Authenticate before creating a privileged client or touching the database.
export async function handleScheduledSync(
  req: Request,
  secret: string | undefined,
  synchronize: (calendarId: string) => Promise<SyncResult>,
): Promise<Response> {
  const respond = (body: unknown, status: number) => Response.json(body, { status });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  if (!secret || secret.length < 32) return respond({ error: "Scheduler not configured" }, 503);
  const supplied = req.headers.get("Authorization") ?? "";
  // Compare fixed-length digests rather than stopping at the first different character.
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [actual, expected] = await Promise.all([digest(supplied), digest(`Bearer ${secret}`)]);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= actual[i] ^ expected[i];
  if (difference !== 0) return respond({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => null);
  if (typeof body?.calendarId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.calendarId)) {
    return respond({ error: "A calendarId UUID is required" }, 400);
  }
  try {
    const result = await synchronize(body.calendarId);
    if (result.results.length === 0) return respond({ error: "No eligible calendar found" }, 404);
    const failed = result.results.filter((item) => item.error).length;
    // Do not leak Google event data or provider errors to the scheduler logs.
    const blocked = result.results.some((item) => item.skipped === "already_running");
    return respond({ ok: failed === 0 && !blocked, calendars: result.results.length, failed }, failed || blocked ? 502 : 200);
  } catch {
    console.error(`Scheduled calendar synchronization failed for ${body.calendarId}; check Google connection and calendar sync status.`);
    return respond({ error: "Scheduled synchronization failed" }, 502);
  }
}
