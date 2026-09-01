import { corsHeaders, errorResponse, HttpError, json } from "../_shared/http.ts";
import { detectContractType } from "../_shared/contracts.ts";
import { getAccessToken, googleFetch } from "../_shared/google.ts";
import { requireAdmin } from "../_shared/supabase.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.4";

type GoogleCalendar = {
  id: string; summary?: string; description?: string; timeZone?: string; accessRole?: string;
  backgroundColor?: string; primary?: boolean; autoAcceptInvitations?: boolean;
};
type GoogleEvent = {
  id: string; status?: string; summary?: string; description?: string; location?: string;
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
  recurringEventId?: string; originalStartTime?: { dateTime?: string; date?: string };
  updated?: string; etag?: string;
  organizer?: { email?: string; displayName?: string; self?: boolean };
  [key: string]: unknown;
};

type ResourceUpdate = {
  id?: string; enabled?: boolean; loginEmail?: string;
  annualContractHours?: number;
};
type CoefficientUpdate = { googleCalendarId?: string; coefficient?: number; hourCategory?: string };

const UNASSIGNED_RESOURCE_NAME = "(CDII)-A DETERMINER";

function isUnassignedResourceName(value: unknown): boolean {
  return String(value ?? "").trim().toLocaleUpperCase("fr") === UNASSIGNED_RESOURCE_NAME;
}

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
    url.searchParams.set("fields", "nextPageToken,items(id,summary,description,timeZone,accessRole,backgroundColor,primary,autoAcceptInvitations)");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await googleFetch(url, token);
    const payload = await response.json();
    if (!response.ok) throw new HttpError(502, `Lecture des calendriers Google impossible (${response.status})`);
    calendars.push(...(payload.items ?? []));
    pageToken = payload.nextPageToken;
  } while (pageToken);

  const resourceCalendars = calendars.filter((calendar) =>
    typeof calendar.autoAcceptInvitations === "boolean" || calendar.id.endsWith("@resource.calendar.google.com")
  );
  const now = new Date().toISOString();
  const rows = resourceCalendars.map((calendar) => ({
      connection_id: connection.id, google_calendar_id: calendar.id,
      name: calendar.summary ?? calendar.id, description: calendar.description ?? null,
      time_zone: calendar.timeZone ?? null, access_role: calendar.accessRole ?? null,
      color: calendar.backgroundColor ?? null, is_primary: calendar.primary ?? false,
      coefficient_rule_id: null, coefficient: 1, is_resource: true, last_discovered_at: now,
    }));
  const { data: previousResources, error: previousError } = await admin.from("calendars")
    .select("id,google_calendar_id").eq("connection_id", connection.id).eq("is_resource", true);
  if (previousError) throw previousError;
  const discoveredIds = new Set(resourceCalendars.map((calendar) => calendar.id));
  const missingIds = (previousResources ?? [])
    .filter((calendar) => !discoveredIds.has(calendar.google_calendar_id))
    .map((calendar) => calendar.id);
  if (missingIds.length) {
    const { error: missingError } = await admin.from("calendars")
      .update({ enabled: false, is_resource: false, sync_token: null }).in("id", missingIds);
    if (missingError) throw missingError;
  }
  for (let offset = 0; offset < rows.length; offset += 250) {
    const { error } = await admin.from("calendars").upsert(rows.slice(offset, offset + 250), {
      onConflict: "connection_id,google_calendar_id",
    });
    if (error) throw error;
  }
  const { data: storedResources, error: resourceError } = await admin.from("calendars")
    .select("id,name").eq("connection_id", connection.id).eq("is_resource", true);
  if (resourceError) throw resourceError;
  const { data: assigned, error: assignedError } = await admin.from("employees")
    .select("resource_calendar_id").not("resource_calendar_id", "is", null);
  if (assignedError) throw assignedError;
  const assignedIds = new Set((assigned ?? []).map((employee) => employee.resource_calendar_id));
  const newEmployees = (storedResources ?? [])
    .filter((calendar) => !assignedIds.has(calendar.id))
    .map((calendar) => ({
      resource_calendar_id: calendar.id,
      display_name: calendar.name,
      active: isUnassignedResourceName(calendar.name),
      is_unassigned_resource: isUnassignedResourceName(calendar.name),
      contract_type: isUnassignedResourceName(calendar.name) ? null : detectContractType(calendar.name),
    }));
  if (newEmployees.length) {
    const { error: employeeError } = await admin.from("employees").insert(newEmployees);
    if (employeeError) throw employeeError;
  }
  for (const calendar of storedResources ?? []) {
    if (isUnassignedResourceName(calendar.name)) continue;
    const { error: contractError } = await admin.from("employees").update({
      contract_type: detectContractType(calendar.name),
    }).eq("resource_calendar_id", calendar.id);
    if (contractError) throw contractError;
  }
  const specialCalendarIds = (storedResources ?? [])
    .filter((calendar) => isUnassignedResourceName(calendar.name))
    .map((calendar) => calendar.id);
  if (specialCalendarIds.length) {
    const { error: specialEmployeeError } = await admin.from("employees").update({
      active: true,
      is_unassigned_resource: true,
      email: null,
      user_id: null,
      contract_type: null,
      annual_contract_hours: null,
    }).in("resource_calendar_id", specialCalendarIds);
    if (specialEmployeeError) throw specialEmployeeError;
    const { error: specialCalendarError } = await admin.from("calendars")
      .update({ enabled: true }).in("id", specialCalendarIds);
    if (specialCalendarError) throw specialCalendarError;
  }
  return { resources: await resourcePayload(admin, connection.id), discovered: resourceCalendars.length };
}

async function resourcePayload(admin: SupabaseClient, connectionId: string) {
  const { data: calendars, error: calendarError } = await admin.from("calendars")
    .select("id,google_calendar_id,name,color,enabled,event_count,last_synced_at")
    .eq("connection_id", connectionId).eq("is_resource", true).order("name");
  if (calendarError) throw calendarError;
  if (!calendars?.length) return [];
  const { data: employees, error: employeeError } = await admin.from("employees")
    .select("id,resource_calendar_id,email,active,user_id,contract_type,annual_contract_hours,is_unassigned_resource")
    .in("resource_calendar_id", calendars.map((calendar) => calendar.id));
  if (employeeError) throw employeeError;
  const employeeByCalendar = new Map((employees ?? []).map((employee) => [employee.resource_calendar_id, employee]));
  return calendars.flatMap((calendar) => {
    const employee = employeeByCalendar.get(calendar.id);
    if (!employee) return [];
    return [{
      id: employee.id, calendar_id: calendar.id, google_calendar_id: calendar.google_calendar_id,
      name: calendar.name, color: calendar.color, enabled: employee.active && calendar.enabled,
      login_email: employee.email, user_id: employee.user_id, event_count: calendar.event_count,
      last_synced_at: calendar.last_synced_at, contract_type: employee.contract_type,
      annual_contract_hours: employee.annual_contract_hours,
      is_unassigned_resource: employee.is_unassigned_resource,
    }];
  });
}

async function coefficientPayload(admin: SupabaseClient, connectionId: string) {
  const { data, error } = await admin.rpc("internal_used_coefficient_calendars", {
    p_connection_id: connectionId,
  });
  if (error) throw error;
  return data ?? [];
}

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function findAuthUserByEmail(admin: SupabaseClient, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = data.users.find((candidate) => normalizeEmail(candidate.email) === email);
    if (user) return user;
    if (data.users.length < 100) return null;
  }
  throw new HttpError(409, "Trop d'utilisateurs Auth pour retrouver l'adresse de connexion");
}

async function provisionUser(admin: SupabaseClient, email: string) {
  const existing = await findAuthUserByEmail(admin, email);
  if (existing) {
    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("role").eq("id", existing.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw new HttpError(409, "Le compte Auth existant n'a pas de profil applicatif");
    if (profile.role === "admin") throw new HttpError(409, "Une adresse administrateur ne peut pas être affectée à une ressource salariée");
    return { user: existing, created: false };
  }
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("Utilisateur Auth non créé");
  return { user: data.user, created: true };
}

async function saveResources(admin: SupabaseClient, ownerId: string, updates: ResourceUpdate[]) {
  const connection = await connectionFor(admin, ownerId);
  if (!Array.isArray(updates) || !updates.length) return { resources: await resourcePayload(admin, connection.id) };
  const ids = updates.map((update) => String(update.id ?? ""));
  const { data: employees, error } = await admin.from("employees")
    .select("id,resource_calendar_id,is_unassigned_resource,calendars!inner(connection_id,is_resource,name)").in("id", ids)
    .eq("calendars.connection_id", connection.id).eq("calendars.is_resource", true);
  if (error) throw error;
  const allowedIds = new Set((employees ?? []).map((employee) => employee.id));
  if (allowedIds.size !== new Set(ids).size) throw new HttpError(400, "Ressource Google inconnue");

  const resourceDetailsById = new Map((employees ?? []).map((employee) => {
    const calendar = Array.isArray(employee.calendars) ? employee.calendars[0] : employee.calendars;
    return [employee.id, {
      isUnassignedResource: Boolean(employee.is_unassigned_resource),
      contractType: detectContractType(calendar?.name),
    }];
  }));
  const normalizedUpdates = updates.map((update) => {
    const id = String(update.id);
    const details = resourceDetailsById.get(id);
    const isUnassignedResource = details?.isUnassignedResource ?? false;
    const annualHoursText = String(update.annualContractHours ?? "").trim();
    const annualContractHours = annualHoursText === "" ? null : Number(annualHoursText);
    return {
      id,
      enabled: isUnassignedResource ? true : Boolean(update.enabled),
      loginEmail: isUnassignedResource ? "" : normalizeEmail(update.loginEmail),
      contractType: isUnassignedResource ? "" : details?.contractType ?? "",
      annualContractHours: isUnassignedResource ? null : (annualContractHours != null && Number.isFinite(annualContractHours) ? annualContractHours : null),
      isUnassignedResource,
    };
  });
  const enabledEmails = normalizedUpdates.filter((update) => update.enabled && !update.isUnassignedResource).map((update) => update.loginEmail);
  if (new Set(enabledEmails).size !== enabledEmails.length) throw new HttpError(400, "Un e-mail de connexion ne peut appartenir qu'à une seule ressource");
  for (const update of normalizedUpdates) {
    if (update.isUnassignedResource) continue;
    if (update.enabled && !validEmail(update.loginEmail)) throw new HttpError(400, "Un e-mail valide est requis pour chaque ressource suivie");
    if (update.contractType && !["CDI", "CDII", "CDD"].includes(update.contractType)) {
      throw new HttpError(400, "Type de contrat invalide : choisissez CDI, CDII ou CDD");
    }
    if (update.enabled && (!update.contractType || update.annualContractHours == null || update.annualContractHours <= 0)) {
      throw new HttpError(400, "Le type de contrat et un nombre d'heures annuelles positif sont requis");
    }
  }

  const createdUserIds: string[] = [];
  const configuredUpdates: Array<{
    id: string; enabled: boolean; loginEmail: string; contractType: string;
    annualContractHours: number | null; isUnassignedResource: boolean; userId: string | null;
  }> = [];
  /*
   * Auth provisioning cannot participate in the Postgres transaction. All Auth users are
   * therefore prepared first; the RPC applies every employee/calendar update atomically,
   * and newly-created users are removed if that transaction fails.
   */
  try {
    for (const update of normalizedUpdates) {
      let userId: string | null = null;
      if (update.enabled && !update.isUnassignedResource) {
        const provisioned = await provisionUser(admin, update.loginEmail);
        userId = provisioned.user.id;
        if (provisioned.created) createdUserIds.push(userId);
      }
      configuredUpdates.push({ ...update, userId });
    }
    const { error: configureError } = await admin.rpc("internal_configure_resources", {
      p_connection_id: connection.id,
      p_updates: configuredUpdates,
    });
    if (configureError) throw configureError;
  } catch (configureError) {
    await Promise.all(createdUserIds.map((userId) => admin.auth.admin.deleteUser(userId)));
    throw configureError;
  }
  return { resources: await resourcePayload(admin, connection.id) };
}

async function saveCoefficients(admin: SupabaseClient, ownerId: string, updates: CoefficientUpdate[]) {
  const connection = await connectionFor(admin, ownerId);
  if (!Array.isArray(updates) || !updates.length) {
    return { calendars: await coefficientPayload(admin, connection.id) };
  }

  const normalizedUpdates = updates.map((update) => ({
    googleCalendarId: normalizeEmail(update.googleCalendarId),
    coefficient: Number(update.coefficient),
    hourCategory: String(update.hourCategory ?? "").trim().toLowerCase(),
  }));
  if (normalizedUpdates.some((update) =>
    !update.googleCalendarId || (update.coefficient !== 1 && update.coefficient !== 1.25)
  )) {
    throw new HttpError(400, "Coefficient invalide : choisissez 1 ou 1,25");
  }
  if (normalizedUpdates.some((update) =>
    !["contract", "absence", "replacement", "public_holiday"].includes(update.hourCategory)
  )) {
    throw new HttpError(400, "Type de comptage invalide");
  }
  if (new Set(normalizedUpdates.map((update) => update.googleCalendarId)).size !== normalizedUpdates.length) {
    throw new HttpError(400, "Un calendrier ne peut être configuré qu'une seule fois");
  }

  const { error } = await admin.rpc("internal_configure_coefficients", {
    p_connection_id: connection.id,
    p_updates: normalizedUpdates,
  });
  if (error) throw error;
  return { calendars: await coefficientPayload(admin, connection.id) };
}

function eventRow(calendarId: string, event: GoogleEvent, runId: string, ruleByGoogleId: Map<string, { id: string }>) {
  const allDay = Boolean(event.start?.date);
  const sourceGoogleCalendarId = normalizeEmail(event.organizer?.email);
  const rule = ruleByGoogleId.get(sourceGoogleCalendarId);
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
    source_google_calendar_id: sourceGoogleCalendarId || null, coefficient_rule_id: rule?.id ?? null,
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

async function executeSync(admin: SupabaseClient, calendar: Record<string, unknown>, token: string, mode: "full" | "incremental", ruleByGoogleId: Map<string, { id: string }>) {
  const { data: run, error: runError } = await admin.from("sync_runs")
    .insert({ calendar_id: calendar.id, mode }).select("id").single();
  if (runError) throw runError;
  let pageToken: string | undefined;
  let pages = 0;
  let seen = 0;
  let unmapped = 0;
  let nextSyncToken: string | undefined;
  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(String(calendar.google_calendar_id))}/events`);
    url.searchParams.set("maxResults", "2500");
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", "true");
    url.searchParams.set("fields", "nextPageToken,nextSyncToken,items(id,status,summary,description,location,organizer(email,displayName,self),start,end,recurringEventId,originalStartTime,updated,etag)");
    if (mode === "incremental") url.searchParams.set("syncToken", String(calendar.sync_token));
    else url.searchParams.set("timeMin", initialTimeMin());
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await googleFetch(url, token);
    if (response.status === 410 && mode === "incremental") {
      await admin.from("sync_runs").update({ status: "error", finished_at: new Date().toISOString(), error_message: "syncToken expiré (410), resynchronisation complète" }).eq("id", run.id);
      await admin.from("calendars").update({ sync_token: null }).eq("id", calendar.id);
      return executeSync(admin, { ...calendar, sync_token: null }, token, "full", ruleByGoogleId);
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
      .map((event) => eventRow(String(calendar.id), event, run.id, ruleByGoogleId));
    unmapped += liveRows.filter((event) => !event.coefficient_rule_id).length;
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
  return { calendarId: calendar.id, mode, pages, eventsSeen: seen, eventCount: count ?? 0, unmappedEvents: unmapped };
}

async function sync(admin: SupabaseClient, ownerId: string, calendarIds?: string[]) {
  const connection = await connectionFor(admin, ownerId);
  let query = admin.from("calendars").select("id,google_calendar_id,sync_token")
    .eq("connection_id", connection.id).eq("is_resource", true).eq("enabled", true);
  if (calendarIds?.length) query = query.in("id", calendarIds);
  const { data: calendars, error } = await query;
  if (error) throw error;
  const token = await getAccessToken(admin, connection.id);
  const { data: rules, error: rulesError } = await admin.from("coefficient_rules")
    .select("id,google_calendar_id").eq("active", true);
  if (rulesError) throw rulesError;
  const ruleByGoogleId = new Map((rules ?? []).map((rule) => [normalizeEmail(rule.google_calendar_id), { id: rule.id }]));
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
      results.push(await executeSync(admin, calendar, token, calendar.sync_token ? "incremental" : "full", ruleByGoogleId));
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
    if (body.action === "resources") {
      const connection = await connectionFor(admin, user.id);
      return json({ resources: await resourcePayload(admin, connection.id) });
    }
    if (body.action === "coefficientCalendars") {
      const connection = await connectionFor(admin, user.id);
      return json({ calendars: await coefficientPayload(admin, connection.id) });
    }
    if (body.action === "saveResources") return json(await saveResources(admin, user.id, body.resources));
    if (body.action === "saveCoefficients") return json(await saveCoefficients(admin, user.id, body.calendars));
    if (body.action === "sync") return json(await sync(admin, user.id, body.calendarIds));
    throw new HttpError(400, "Action attendue: discover, resources, coefficientCalendars, saveResources, saveCoefficients ou sync");
  } catch (error) {
    return errorResponse(error);
  }
});
