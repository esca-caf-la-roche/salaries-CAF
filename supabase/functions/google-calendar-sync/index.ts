import { corsHeaders, errorResponse, HttpError, json } from "../_shared/http.ts";
import { getAccessToken, googleFetch } from "../_shared/google.ts";
import { requireAdmin } from "../_shared/supabase.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.4";

type GoogleCalendar = {
  id: string; summary?: string; description?: string; timeZone?: string; accessRole?: string;
  backgroundColor?: string; primary?: boolean;
};
type GoogleEvent = {
  id: string; status?: string; summary?: string; description?: string; location?: string;
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
  recurringEventId?: string; originalStartTime?: { dateTime?: string; date?: string };
  updated?: string; etag?: string; [key: string]: unknown;
};

async function connectionFor(admin: SupabaseClient, ownerId: string) {
  const { data, error } = await admin.from("google_connections")
    .select("id").eq("owner_id", ownerId).is("revoked_at", null).single();
  if (error || !data) throw new HttpError(409, "Connectez d'abord le compte Google");
  return data as { id: string };
}

async function discover(admin: SupabaseClient, ownerId: string) {
  const connection = await connectionFor(admin, ownerId);
  const token = await getAccessToken(admin, connection.id);
  const calendars: GoogleCalendar[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("minAccessRole", "reader");
    url.searchParams.set("fields", "nextPageToken,items(id,summary,description,timeZone,accessRole,backgroundColor,primary)");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await googleFetch(url, token);
    const payload = await response.json();
    if (!response.ok) throw new HttpError(502, `Lecture des calendriers Google impossible (${response.status})`);
    calendars.push(...(payload.items ?? []));
    pageToken = payload.nextPageToken;
  } while (pageToken);

  const { data: rules, error: rulesError } = await admin.from("coefficient_rules")
    .select("id,google_calendar_id,coefficient").eq("active", true);
  if (rulesError) throw rulesError;
  const ruleByGoogleId = new Map((rules ?? []).map((rule) => [rule.google_calendar_id, rule]));
  const now = new Date().toISOString();
  const rows = calendars.map((calendar) => {
    const rule = ruleByGoogleId.get(calendar.id);
    return {
      connection_id: connection.id, google_calendar_id: calendar.id,
      name: calendar.summary ?? calendar.id, description: calendar.description ?? null,
      time_zone: calendar.timeZone ?? null, access_role: calendar.accessRole ?? null,
      color: calendar.backgroundColor ?? null, is_primary: calendar.primary ?? false,
      coefficient_rule_id: rule?.id ?? null, coefficient: rule?.coefficient ?? 1,
      last_discovered_at: now,
    };
  });
  for (let offset = 0; offset < rows.length; offset += 250) {
    const { error } = await admin.from("calendars").upsert(rows.slice(offset, offset + 250), {
      onConflict: "connection_id,google_calendar_id",
    });
    if (error) throw error;
  }
  const { data, error } = await admin.from("calendars")
    .select("id,google_calendar_id,name,color,enabled,coefficient,event_count,last_synced_at,coefficient_rule_id")
    .eq("connection_id", connection.id).order("name");
  if (error) throw error;
  return { calendars: data, discovered: calendars.length };
}

function eventRow(calendarId: string, event: GoogleEvent, runId: string) {
  const allDay = Boolean(event.start?.date);
  return {
    calendar_id: calendarId, google_event_id: event.id, status: event.status ?? "confirmed",
    summary: event.summary ?? null, description: event.description ?? null, location: event.location ?? null,
    starts_at: allDay ? null : event.start?.dateTime,
    ends_at: allDay ? null : event.end?.dateTime,
    start_date: allDay ? event.start?.date : null,
    end_date: allDay ? event.end?.date : null,
    all_day: allDay, recurring_event_id: event.recurringEventId ?? null,
    original_start_time: event.originalStartTime?.dateTime ?? event.originalStartTime?.date ?? null,
    google_updated_at: event.updated ?? null, etag: event.etag ?? null,
    raw: event, last_seen_sync_run_id: runId,
  };
}

function initialTimeMin(): string {
  const configured = Deno.env.get("GOOGLE_FULL_SYNC_TIME_MIN");
  if (configured) return new Date(configured).toISOString();
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 3, 0, 1);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

async function executeSync(admin: SupabaseClient, calendar: Record<string, unknown>, token: string, mode: "full" | "incremental") {
  const { data: run, error: runError } = await admin.from("sync_runs")
    .insert({ calendar_id: calendar.id, mode }).select("id").single();
  if (runError) throw runError;
  let pageToken: string | undefined;
  let pages = 0;
  let seen = 0;
  let nextSyncToken: string | undefined;
  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(String(calendar.google_calendar_id))}/events`);
    url.searchParams.set("maxResults", "2500");
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", "true");
    url.searchParams.set("fields", "nextPageToken,nextSyncToken,items(id,status,summary,description,location,start,end,recurringEventId,originalStartTime,updated,etag)");
    if (mode === "incremental") url.searchParams.set("syncToken", String(calendar.sync_token));
    else url.searchParams.set("timeMin", initialTimeMin());
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await googleFetch(url, token);
    if (response.status === 410 && mode === "incremental") {
      await admin.from("sync_runs").update({ status: "error", finished_at: new Date().toISOString(), error_message: "syncToken expiré (410), resynchronisation complète" }).eq("id", run.id);
      await admin.from("calendars").update({ sync_token: null }).eq("id", calendar.id);
      return executeSync(admin, { ...calendar, sync_token: null }, token, "full");
    }
    const payload = await response.json();
    if (!response.ok) throw new HttpError(502, `Synchronisation Google impossible (${response.status})`);
    const events = (payload.items ?? []) as GoogleEvent[];
    const deletedIds = events.filter((event) => event.status === "cancelled").map((event) => event.id);
    if (deletedIds.length) {
      const { error } = await admin.from("calendar_events").delete()
        .eq("calendar_id", calendar.id).in("google_event_id", deletedIds);
      if (error) throw error;
    }
    const liveRows = events.filter((event) => event.status !== "cancelled" && event.start && event.end)
      .map((event) => eventRow(String(calendar.id), event, run.id));
    for (let offset = 0; offset < liveRows.length; offset += 250) {
      const { error } = await admin.from("calendar_events").upsert(liveRows.slice(offset, offset + 250), {
        onConflict: "calendar_id,google_event_id",
      });
      if (error) throw error;
    }
    pages += 1;
    seen += events.length;
    pageToken = payload.nextPageToken;
    nextSyncToken = payload.nextSyncToken ?? nextSyncToken;
  } while (pageToken);
  if (!nextSyncToken) throw new Error("Google n'a pas renvoyé de nextSyncToken final");

  if (mode === "full") {
    const { error } = await admin.from("calendar_events").delete()
      .eq("calendar_id", calendar.id)
      .or(`last_seen_sync_run_id.neq.${run.id},last_seen_sync_run_id.is.null`);
    if (error) throw error;
  }
  const { count, error: countError } = await admin.from("calendar_events")
    .select("id", { count: "exact", head: true }).eq("calendar_id", calendar.id);
  if (countError) throw countError;
  const now = new Date().toISOString();
  await admin.from("sync_runs").update({ status: "success", pages_fetched: pages, events_seen: seen, finished_at: now }).eq("id", run.id);
  const { error: calendarError } = await admin.from("calendars").update({
    sync_token: nextSyncToken, sync_status: "success", sync_error: null,
    last_synced_at: now, event_count: count ?? 0, sync_lock_expires_at: null,
  }).eq("id", calendar.id);
  if (calendarError) throw calendarError;
  return { calendarId: calendar.id, mode, pages, eventsSeen: seen, eventCount: count ?? 0 };
}

async function sync(admin: SupabaseClient, ownerId: string, calendarIds?: string[]) {
  const connection = await connectionFor(admin, ownerId);
  let query = admin.from("calendars").select("id,google_calendar_id,sync_token")
    .eq("connection_id", connection.id).eq("enabled", true);
  if (calendarIds?.length) query = query.in("id", calendarIds);
  const { data: calendars, error } = await query;
  if (error) throw error;
  const token = await getAccessToken(admin, connection.id);
  const results = [];
  for (const calendar of calendars ?? []) {
    const now = new Date().toISOString();
    const lockUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    const { data: locked, error: lockError } = await admin.from("calendars")
      .update({ sync_status: "running", sync_started_at: now, sync_lock_expires_at: lockUntil })
      .eq("id", calendar.id).or(`sync_lock_expires_at.is.null,sync_lock_expires_at.lt.${now}`)
      .select("id").maybeSingle();
    if (lockError) throw lockError;
    if (!locked) { results.push({ calendarId: calendar.id, skipped: "already_running" }); continue; }
    try {
      results.push(await executeSync(admin, calendar, token, calendar.sync_token ? "incremental" : "full"));
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "Erreur de synchronisation";
      await admin.from("sync_runs").update({
        status: "error", error_message: message, finished_at: new Date().toISOString(),
      }).eq("calendar_id", calendar.id).eq("status", "running");
      await admin.from("calendars").update({ sync_status: "error", sync_error: message, sync_lock_expires_at: null }).eq("id", calendar.id);
      results.push({ calendarId: calendar.id, error: message });
    }
  }
  return { results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    if (req.method !== "POST") throw new HttpError(405, "Méthode non autorisée");
    const { user, admin } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    if (body.action === "discover") return json(await discover(admin, user.id));
    if (body.action === "sync") return json(await sync(admin, user.id, body.calendarIds));
    throw new HttpError(400, "Action attendue: discover ou sync");
  } catch (error) {
    return errorResponse(error);
  }
});
