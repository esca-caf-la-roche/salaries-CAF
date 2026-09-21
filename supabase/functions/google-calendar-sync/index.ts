import { corsHeaders, errorResponse, HttpError, json } from "../_shared/http.ts";
import { independentSeasonBounds, clipIndependentEvent } from "../_shared/independentEvents.ts";
import { detectContractType } from "../_shared/contracts.ts";
import { getAccessToken, googleFetch } from "../_shared/google.ts";
import { requireActiveUser } from "../_shared/supabase.ts";
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
  attendees?: Array<{ email?: string; displayName?: string; resource?: boolean; responseStatus?: string }>;
  [key: string]: unknown;
};

type ResourceUpdate = {
  id?: string; enabled?: boolean; loginEmail?: string;
  annualContractHours?: number; paidMonths?: number;
};
type CoefficientUpdate = { googleCalendarId?: string; coefficient?: number; hourCategory?: string | null };

const UNASSIGNED_RESOURCE_GOOGLE_ID = "c_1885o4bj2rlv4gijgd278pfg9rub0@resource.calendar.google.com";
const ABSENCE_CALENDAR_GOOGLE_ID = "c_4ed912f70b6b3db20a1aa55ee91a32c90e82bf6e9e41fb514b9ad671790a4bb6@group.calendar.google.com";
const REPLACEMENT_CALENDAR_GOOGLE_ID = "c_0c7e7b5cd64848b9ff300c38c6ed06da82f39c7010f98b5ffd46c32b37bfbcf1@group.calendar.google.com";
const RESOURCE_ID_PATTERN = /^[^\s@]+@resource\.calendar\.google\.com$/i;

function isUnassignedResource(calendar: { google_calendar_id?: unknown; name?: unknown }): boolean {
  return normalizeEmail(calendar.google_calendar_id) === UNASSIGNED_RESOURCE_GOOGLE_ID;
}

// Le compte Google (celui de l'association) est partagé : tous les utilisateurs passent par la même connexion.
async function sharedConnectionFor(admin: SupabaseClient) {
  const { data, error } = await admin.from("google_connections")
    .select("id").is("revoked_at", null)
    .order("connected_at", { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(409, "Aucun compte Google connecté. Un administrateur doit d'abord connecter le compte Google de l'association.");
  return data as { id: string };
}

async function listGoogleCalendars(token: string): Promise<GoogleCalendar[]> {
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
  return calendars;
}

async function refreshCoefficientCalendarMetadata(
  admin: SupabaseClient,
  connectionId: string,
  calendars: GoogleCalendar[],
) {
  const metadata = calendars.map((calendar) => ({
    googleCalendarId: calendar.id,
    label: calendar.summary ?? calendar.id,
    color: calendar.backgroundColor ?? null,
  }));
  const { error } = await admin.rpc("internal_sync_coefficient_calendar_metadata", {
    p_connection_id: connectionId,
    p_calendars: metadata,
  });
  if (error) throw error;
}

async function discover(admin: SupabaseClient) {
  const connection = await sharedConnectionFor(admin);
  const token = await getAccessToken(admin, connection.id);
  const calendars = await listGoogleCalendars(token);
  await refreshCoefficientCalendarMetadata(admin, connection.id, calendars);

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
    .select("id,google_calendar_id,name").eq("connection_id", connection.id).eq("is_resource", true);
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
      active: isUnassignedResource(calendar),
      is_unassigned_resource: isUnassignedResource(calendar),
      contract_type: isUnassignedResource(calendar) ? null : detectContractType(calendar.name),
    }));
  if (newEmployees.length) {
    const { error: employeeError } = await admin.from("employees").insert(newEmployees);
    if (employeeError) throw employeeError;
  }
  for (const calendar of storedResources ?? []) {
    if (isUnassignedResource(calendar)) continue;
    const { error: contractError } = await admin.from("employees").update({
      contract_type: detectContractType(calendar.name),
    }).eq("resource_calendar_id", calendar.id);
    if (contractError) throw contractError;
  }
  const specialCalendarIds = (storedResources ?? [])
    .filter((calendar) => isUnassignedResource(calendar))
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
    .select("id,resource_calendar_id,email,active,user_id,contract_type,annual_contract_hours,paid_months,is_unassigned_resource")
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
      paid_months: employee.paid_months,
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

async function saveResources(admin: SupabaseClient, updates: ResourceUpdate[]) {
  const connection = await sharedConnectionFor(admin);
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
    const paidMonths = Number(update.paidMonths ?? 12);
    return {
      id,
      enabled: isUnassignedResource ? true : Boolean(update.enabled),
      loginEmail: isUnassignedResource ? "" : normalizeEmail(update.loginEmail),
      contractType: isUnassignedResource ? "" : details?.contractType ?? "",
      annualContractHours: isUnassignedResource ? null : (annualContractHours != null && Number.isFinite(annualContractHours) ? annualContractHours : null),
      paidMonths: isUnassignedResource ? 12 : paidMonths,
      isUnassignedResource,
    };
  });
  const enabledEmails = normalizedUpdates.filter((update) => update.enabled && !update.isUnassignedResource).map((update) => update.loginEmail);
  if (new Set(enabledEmails).size !== enabledEmails.length) throw new HttpError(400, "Un e-mail de connexion ne peut appartenir qu'à une seule ressource");
  for (const update of normalizedUpdates) {
    if (update.isUnassignedResource) continue;
    if (update.enabled && !validEmail(update.loginEmail)) throw new HttpError(400, "Un e-mail valide est requis pour chaque ressource suivie");
    if (update.contractType && !["CDI", "CDII", "CDD", "INDEP"].includes(update.contractType)) {
      throw new HttpError(400, "Type de contrat invalide : choisissez CDI, CDII, CDD ou Indépendant");
    }
    if (update.enabled && (!update.contractType || (update.contractType !== "INDEP" && (update.annualContractHours == null || update.annualContractHours <= 0)))) {
      throw new HttpError(400, "Le type de contrat et un nombre d'heures annuelles positif sont requis");
    }
    if (update.contractType !== "INDEP" && (!Number.isInteger(update.paidMonths) || update.paidMonths < 1 || update.paidMonths > 12)) {
      throw new HttpError(400, "Le nombre de mois de paiement doit être compris entre 1 et 12");
    }
  }

  const createdUserIds: string[] = [];
  const configuredUpdates: Array<{
    id: string; enabled: boolean; loginEmail: string; contractType: string;
    annualContractHours: number | null; paidMonths: number; isUnassignedResource: boolean; userId: string | null;
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

async function saveCoefficients(admin: SupabaseClient, updates: CoefficientUpdate[]) {
  const connection = await sharedConnectionFor(admin);
  if (!Array.isArray(updates) || !updates.length) {
    return { calendars: await coefficientPayload(admin, connection.id) };
  }

  const normalizedUpdates = updates.map((update) => ({
    googleCalendarId: normalizeEmail(update.googleCalendarId),
    coefficient: Number(update.coefficient),
    hourCategory: String(update.hourCategory ?? "").trim().toLowerCase() || null,
  }));
  if (normalizedUpdates.some((update) =>
    !update.googleCalendarId || (update.coefficient !== 1 && update.coefficient !== 1.25)
  )) {
    throw new HttpError(400, "Coefficient invalide : choisissez 1 ou 1,25");
  }
  if (normalizedUpdates.some((update) => !update.hourCategory || ![
    "contract",
    "absence",
    "replacement",
    "public_holiday",
  ].includes(update.hourCategory))) {
    throw new HttpError(400, "Type d'heures invalide");
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
    url.searchParams.set("fields", "nextPageToken,nextSyncToken,items(id,status,summary,description,location,organizer(email,displayName,self),start,end,recurringEventId,originalStartTime,updated,etag,attendees,htmlLink)");
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
    if (calendar.contract_type !== "INDEP") {
      unmapped += liveRows.filter((event) => !event.coefficient_rule_id).length;
    }
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

async function sync(admin: SupabaseClient, calendarIds?: string[]) {
  const connection = await sharedConnectionFor(admin);
  return syncConnection(admin, connection, calendarIds);
}

async function syncConnection(admin: SupabaseClient, connection: Record<string, unknown>, calendarIds?: string[]) {
  let query = admin.from("calendars").select("id,google_calendar_id,sync_token,employees!employees_resource_calendar_id_fkey(contract_type)")
    .eq("connection_id", connection.id).eq("is_resource", true).eq("enabled", true);
  if (calendarIds?.length) query = query.in("id", calendarIds);
  const { data: calendars, error } = await query;
  if (error) throw error;
  const token = await getAccessToken(admin, connection.id);
  const { data: rules, error: rulesError } = await admin.from("coefficient_rules")
    .select("id,google_calendar_id").eq("active", true).not("hour_category", "is", null);
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
      const employee = Array.isArray(calendar.employees) ? calendar.employees[0] : calendar.employees;
      results.push(await executeSync(admin, { ...calendar, contract_type: employee?.contract_type }, token, calendar.sync_token ? "incremental" : "full", ruleByGoogleId));
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

async function syncEmployeeCalendar(admin: SupabaseClient, userId: string, mode: unknown) {
  const { data: employee, error } = await admin.from("employees")
    .select("id,contract_type,resource_calendar_id,calendars!employees_resource_calendar_id_fkey(id,connection_id,last_synced_at,enabled,is_resource)")
    .eq("user_id", userId).eq("active", true).single();
  if (error || !employee) throw new HttpError(403, "Aucune ressource salariée active n’est associée à ce compte");
  const calendar = Array.isArray(employee.calendars) ? employee.calendars[0] : employee.calendars;
  if (!calendar?.id || !calendar.enabled || !calendar.is_resource) throw new HttpError(409, "Calendrier salarié indisponible");
  const manual = mode === "manual";
  if (manual && employee.contract_type !== "CDI") throw new HttpError(403, "L’actualisation manuelle est réservée aux salariés CDI");
  if (!manual && calendar.last_synced_at && Date.now() - new Date(calendar.last_synced_at).getTime() < 60 * 60_000) {
    return { results: [{ calendarId: calendar.id, skipped: "recently_synced" }] };
  }
  return syncConnection(admin, { id: calendar.connection_id }, [String(calendar.id)]);
}

function eventPayload(event: Record<string, unknown>) {
  const raw = (event.raw ?? {}) as Record<string, unknown>;
  const organizer = (raw.organizer ?? {}) as Record<string, unknown>;
  const rule = Array.isArray(event.coefficient_rules)
    ? event.coefficient_rules[0] as Record<string, unknown> | undefined
    : event.coefficient_rules as Record<string, unknown> | null;
  const sourceCalendarId = String(event.source_google_calendar_id ?? "");
  const invoiceEvent = Array.isArray(event.independent_invoice_events)
    ? event.independent_invoice_events[0] as Record<string, unknown> | undefined
    : event.independent_invoice_events as Record<string, unknown> | null;
  return {
    id: String(event.id),
    googleEventId: String(event.google_event_id),
    title: String(event.summary ?? "Événement sans titre"),
    description: String(event.description ?? ""),
    location: String(event.location ?? ""),
    startsAt: String(event.starts_at ?? event.start_date ?? ""),
    endsAt: String(event.ends_at ?? event.end_date ?? ""),
    allDay: Boolean(event.all_day),
    sourceCalendarId,
    sourceCalendarName: String(rule?.label ?? organizer.displayName ?? sourceCalendarId ?? "Calendrier inconnu") || "Calendrier inconnu",
    sourceCalendarColor: typeof rule?.color === "string" ? rule.color : null,
    invoiceId: invoiceEvent?.invoice_id ? String(invoiceEvent.invoice_id) : null,
  };
}

async function independentEvents(admin: SupabaseClient, schoolYear: unknown) {
  if (typeof schoolYear !== "number" || !Number.isInteger(schoolYear) || schoolYear < 2000 || schoolYear > 2100) {
    throw new HttpError(400, "Année scolaire invalide");
  }
  const bounds = independentSeasonBounds(schoolYear);
  const connection = await sharedConnectionFor(admin);
  const { data: employees, error: employeesError } = await admin.from("employees")
    .select("id,display_name,resource_calendar_id,calendars!employees_resource_calendar_id_fkey!inner(id,last_synced_at)")
    .eq("active", true).eq("contract_type", "INDEP")
    .eq("calendars.connection_id", connection.id).eq("calendars.enabled", true).eq("calendars.is_resource", true);
  if (employeesError) throw employeesError;
  const events: Record<string, unknown>[] = [];
  for (const employee of employees ?? []) {
    const calendar = Array.isArray(employee.calendars) ? employee.calendars[0] : employee.calendars;
    if (!calendar) continue;
    if (!calendar.last_synced_at) {
      const synchronization = await sync(admin, [String(calendar.id)]);
      const failed = synchronization.results.find((result) => "error" in result && result.error);
      if (failed && "error" in failed) {
        throw new HttpError(502, `Synchronisation de la ressource indépendante impossible : ${failed.error}`);
      }
    }
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await admin.from("calendar_events")
        .select("id,google_event_id,summary,description,location,starts_at,ends_at,all_day,source_google_calendar_id,raw,coefficient_rules(label,color),independent_invoice_events(invoice_id)")
        .eq("calendar_id", calendar.id).eq("all_day", false).neq("status", "cancelled")
        .lt("starts_at", bounds.endsAt).gt("ends_at", bounds.startsAt)
        .order("starts_at").order("id").range(from, from + pageSize - 1);
      if (error) throw error;
      const googleEventIds = (data ?? []).map((event) => String(event.google_event_id));
      const { data: billedRows, error: billedError } = googleEventIds.length
        ? await admin.from("independent_invoice_events").select("google_event_id,invoice_id")
          .eq("resource_calendar_id", calendar.id).in("google_event_id", googleEventIds)
        : { data: [], error: null };
      if (billedError) throw billedError;
      const invoiceByGoogleEventId = new Map((billedRows ?? []).map((row) => [String(row.google_event_id), String(row.invoice_id)]));
      for (const event of data ?? []) {
        const clipped = clipIndependentEvent(event.starts_at, event.ends_at, bounds);
        if (clipped) events.push({ ...eventPayload(event), ...clipped, invoiceId: invoiceByGoogleEventId.get(String(event.google_event_id)) ?? null, employeeId: String(employee.id), employeeName: String(employee.display_name) });
      }
      if ((data ?? []).length < pageSize) break;
    }
  }
  return { events };
}

async function createIndependentInvoice(admin: SupabaseClient, ownerId: string, body: Record<string, unknown>) {
  const eventIds = body.eventIds;
  const schoolYear = body.schoolYear;
  if (typeof body.employeeId !== "string" || !Array.isArray(eventIds) || eventIds.some((id) => typeof id !== "string")
    || typeof schoolYear !== "number" || !Number.isInteger(schoolYear)
    || typeof body.invoiceNumber !== "string" || typeof body.receivedOn !== "string") {
    throw new HttpError(400, "Données de facture invalides");
  }
  const { data, error } = await admin.rpc("internal_create_independent_invoice", {
    p_owner_id: ownerId,
    p_employee_id: body.employeeId,
    p_event_ids: eventIds,
    p_school_year: schoolYear,
    p_invoice_number: body.invoiceNumber,
    p_received_on: body.receivedOn,
  });
  if (error) {
    if (error.code === "23505" && error.message.includes("independent_invoices_employee_number_unique")) {
      throw new HttpError(409, "Cette référence de facture existe déjà pour cet indépendant");
    }
    if (error.code === "23505") throw new HttpError(409, "Un des événements sélectionnés est déjà dans une facture");
    throw error;
  }
  const invoice = Array.isArray(data) ? data[0] : data;
  if (!invoice?.invoice_id) throw new Error("La facture n’a pas été créée");
  return { invoiceId: String(invoice.invoice_id), totalMinutes: Number(invoice.total_minutes) };
}

async function independentInvoices(admin: SupabaseClient, employeeId: unknown) {
  if (typeof employeeId !== "string") throw new HttpError(400, "Indépendant invalide");
  const { data, error } = await admin.from("independent_invoices")
    .select("id,invoice_number,received_on,total_minutes,independent_invoice_events(count),employees!inner(resource_calendar_id,calendars!employees_resource_calendar_id_fkey!inner(connection_id))")
    .eq("employee_id", employeeId).eq("employees.calendars.connection_id", (await sharedConnectionFor(admin)).id)
    .order("received_on", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return { invoices: (data ?? []).map((invoice) => ({ id: String(invoice.id), invoiceNumber: invoice.invoice_number ? String(invoice.invoice_number) : null, receivedOn: String(invoice.received_on), totalMinutes: Number(invoice.total_minutes), eventCount: Array.isArray(invoice.independent_invoice_events) ? Number(invoice.independent_invoice_events[0]?.count ?? 0) : 0 })) };
}

async function updateIndependentInvoice(admin: SupabaseClient, ownerId: string, body: Record<string, unknown>) {
  if (typeof body.invoiceId !== "string" || typeof body.invoiceNumber !== "string" || typeof body.receivedOn !== "string" || !Array.isArray(body.eventIds) || body.eventIds.some((id) => typeof id !== "string") || typeof body.schoolYear !== "number") throw new HttpError(400, "Données de facture invalides");
  const { error } = await admin.rpc("internal_update_independent_invoice", { p_owner_id: ownerId, p_invoice_id: body.invoiceId, p_invoice_number: body.invoiceNumber, p_received_on: body.receivedOn });
  if (error) throw error;
  const { data: totalMinutes, error: eventsError } = await admin.rpc("internal_replace_independent_invoice_events", { p_owner_id: ownerId, p_invoice_id: body.invoiceId, p_event_ids: body.eventIds, p_school_year: body.schoolYear });
  if (eventsError) {
    if (eventsError.code === "23505") throw new HttpError(409, "Un des événements sélectionnés est déjà dans une autre facture");
    throw eventsError;
  }
  return { ok: true, totalMinutes: Number(totalMinutes) };
}

async function deleteIndependentInvoice(admin: SupabaseClient, ownerId: string, body: Record<string, unknown>) {
  if (typeof body.invoiceId !== "string") throw new HttpError(400, "Facture invalide");
  const { error } = await admin.rpc("internal_delete_independent_invoice", { p_owner_id: ownerId, p_invoice_id: body.invoiceId });
  if (error) throw error;
  return { ok: true };
}

async function unassignedEvents(admin: SupabaseClient) {
  const connection = await sharedConnectionFor(admin);
  const { data: calendars, error: calendarsError } = await admin.from("calendars")
    .select("id,last_synced_at")
    .eq("connection_id", connection.id)
    .eq("is_resource", true)
    .eq("enabled", true)
    .eq("google_calendar_id", UNASSIGNED_RESOURCE_GOOGLE_ID);
  if (calendarsError) throw calendarsError;
  const calendarIds = (calendars ?? []).map((calendar) => String(calendar.id));
  if (!calendarIds.length) return { events: [] };

  const neverSyncedIds = (calendars ?? [])
    .filter((calendar) => !calendar.last_synced_at)
    .map((calendar) => String(calendar.id));
  if (neverSyncedIds.length) {
    const synchronization = await sync(admin, neverSyncedIds);
    const failed = synchronization.results.find((result) => "error" in result && result.error);
    if (failed && "error" in failed) {
      throw new HttpError(502, `Synchronisation de la ressource À déterminer impossible : ${failed.error}`);
    }
  }

  const events: Record<string, unknown>[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin.from("calendar_events")
      .select("id,google_event_id,summary,description,location,starts_at,ends_at,start_date,end_date,all_day,source_google_calendar_id,raw,coefficient_rules(label,color)")
      .in("calendar_id", calendarIds)
      .neq("status", "cancelled")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    events.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }

  return {
    events: events.map((event) => {
      return eventPayload(event);
    }),
  };
}

type ReplacementResource = { google_calendar_id: string; name: string; color: string | null };

function requiredString(value: unknown, label: string, maxLength = 512): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new HttpError(400, `${label} invalide`);
  }
  return value.trim();
}

function validInstant(value: unknown, label: string): string {
  const instant = requiredString(value, label, 64);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(instant) || !Number.isFinite(Date.parse(instant))) {
    throw new HttpError(400, `${label} doit être une date ISO avec heure`);
  }
  return instant;
}

function parisMonthBoundary(year: number, zeroBasedMonth: number): string {
  const guess = Date.UTC(year, zeroBasedMonth, 1, 12);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(guess));
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  const offset = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second")) - guess;
  return new Date(Date.UTC(year, zeroBasedMonth, 1) - offset).toISOString();
}

async function replacementResources(admin: SupabaseClient, connectionId: string): Promise<ReplacementResource[]> {
  const { data, error } = await admin.from("calendars")
    .select("google_calendar_id,name,color")
    .eq("connection_id", connectionId).eq("is_resource", true).eq("enabled", true);
  if (error) throw error;
  return (data ?? []) as ReplacementResource[];
}

function assertKnownResource(resources: ReplacementResource[], value: unknown, label: string): string {
  const id = requiredString(value, label);
  if (!RESOURCE_ID_PATTERN.test(id) || !resources.some((resource) => resource.google_calendar_id === id)) {
    throw new HttpError(400, `${label} ne correspond pas à une ressource active`);
  }
  return id;
}

async function googleJson(
  token: string,
  url: URL,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: unknown,
): Promise<Record<string, unknown>> {
  const response = method === "GET"
    ? await googleFetch(url, token)
    : await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const googleError = payload.error as { message?: string; status?: string } | undefined;
    if (response.status === 401 || response.status === 403) {
      throw new HttpError(409, "Google Calendar refuse cette opération. Reconnectez le compte Google pour accorder le droit d’écriture.");
    }
    if (response.status === 404) throw new HttpError(404, "Événement Google introuvable");
    if (response.status === 409 || response.status === 412) throw new HttpError(409, "L’événement Google a été modifié simultanément");
    throw new HttpError(502, `Google Calendar indisponible (${response.status}${googleError?.status ? `, ${googleError.status}` : ""})`);
  }
  return payload;
}

async function replacementMonthEvents(admin: SupabaseClient, connectionId: string, body: Record<string, unknown>) {
  const resources = await replacementResources(admin, connectionId);
  const resourceCalendarId = assertKnownResource(resources, body.resourceCalendarId, "resourceCalendarId");
  if (!Number.isInteger(body.year) || Number(body.year) < 2020 || Number(body.year) > 2100) throw new HttpError(400, "year invalide");
  if (!Number.isInteger(body.month) || Number(body.month) < 1 || Number(body.month) > 12) throw new HttpError(400, "month invalide");
  const timeMin = parisMonthBoundary(Number(body.year), Number(body.month) - 1);
  const timeMax = parisMonthBoundary(Number(body.year), Number(body.month));
  const token = await getAccessToken(admin, connectionId);
  const events: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(resourceCalendarId)}/events`);
    url.searchParams.set("timeMin", timeMin); url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true"); url.searchParams.set("maxResults", "2500");
    url.searchParams.set("fields", "nextPageToken,items(id,status,summary,start,end,organizer,attendees,location,description)");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const payload = await googleJson(token, url);
    const items = Array.isArray(payload.items) ? payload.items as GoogleEvent[] : [];
    events.push(...items.filter((event) => event.status !== "cancelled").map((event) => ({
      id: event.id, title: event.summary ?? "Sans titre", startTime: event.start?.dateTime ?? event.start?.date,
      endTime: event.end?.dateTime ?? event.end?.date, calendarId: resourceCalendarId,
      organizer: event.organizer?.email ?? "",
      resource: event.attendees?.find((attendee) => attendee.resource || RESOURCE_ID_PATTERN.test(attendee.email ?? ""))?.email ?? resourceCalendarId,
    })));
    pageToken = typeof payload.nextPageToken === "string" ? payload.nextPageToken : undefined;
  } while (pageToken);
  return { events };
}

async function replacementAvailability(admin: SupabaseClient, connectionId: string, body: Record<string, unknown>) {
  const timeMin = validInstant(body.timeMin, "timeMin");
  const timeMax = validInstant(body.timeMax, "timeMax");
  const duration = Date.parse(timeMax) - Date.parse(timeMin);
  if (duration <= 0 || duration > 31 * 24 * 60 * 60_000) throw new HttpError(400, "La période doit être positive et limitée à 31 jours");
  const resources = await replacementResources(admin, connectionId);
  if (resources.length > 50) throw new HttpError(409, "Trop de ressources actives pour une requête de disponibilité");
  const token = await getAccessToken(admin, connectionId);
  const url = new URL("https://www.googleapis.com/calendar/v3/freeBusy");
  const payload = await googleJson(token, url, "POST", {
    timeMin, timeMax, timeZone: "Europe/Paris", items: resources.map((resource) => ({ id: resource.google_calendar_id })),
  });
  const calendars = (payload.calendars ?? {}) as Record<string, { busy?: unknown[]; errors?: unknown[] }>;
  const failed = resources.filter((resource) => calendars[resource.google_calendar_id]?.errors?.length);
  if (failed.length) throw new HttpError(502, `Disponibilité Google incomplète pour ${failed.length} ressource(s)`);
  return { resources: resources.filter((resource) => (calendars[resource.google_calendar_id]?.busy ?? []).length === 0)
    .map((resource) => ({ id: resource.google_calendar_id, name: resource.name, color: resource.color })) };
}

function eventTimes(event: GoogleEvent) {
  if (event.start?.dateTime && event.end?.dateTime) return {
    start: { dateTime: event.start.dateTime, timeZone: "Europe/Paris" },
    end: { dateTime: event.end.dateTime, timeZone: "Europe/Paris" },
  };
  if (event.start?.date && event.end?.date) return { start: { date: event.start.date }, end: { date: event.end.date } };
  throw new HttpError(409, "L’événement Google n’a pas de période exploitable");
}

async function processReplacement(
  admin: SupabaseClient,
  connectionId: string,
  resources: ReplacementResource[],
  body: Record<string, unknown>,
) {
  const eventId = requiredString(body.eventId, "eventId", 1024).replace(/@google\.com$/i, "");
  const sourceResourceCalendarId = assertKnownResource(resources, body.sourceResourceCalendarId, "sourceResourceCalendarId");
  const absenceAttendee = assertKnownResource(resources, body.absenceAttendee, "absenceAttendee");
  const replacementAttendee = assertKnownResource(resources, body.replacementAttendee, "replacementAttendee");
  if (absenceAttendee === replacementAttendee) throw new HttpError(400, "Le salarié absent et son remplaçant doivent être différents");
  const token = await getAccessToken(admin, connectionId);
  const sourceUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(sourceResourceCalendarId)}/events/${encodeURIComponent(eventId)}`);
  const sourceEvent = await googleJson(token, sourceUrl) as GoogleEvent;
  const organizerId = requiredString(sourceEvent.organizer?.email, "organisateur Google");
  const organizerUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(organizerId)}/events/${encodeURIComponent(eventId)}`);
  const fullEvent = await googleJson(token, organizerUrl) as GoogleEvent;
  const attendees = Array.isArray(fullEvent.attendees) ? fullEvent.attendees : [];

  if (absenceAttendee === UNASSIGNED_RESOURCE_GOOGLE_ID) {
    const retained = attendees.filter((attendee) => normalizeEmail(attendee.email) !== UNASSIGNED_RESOURCE_GOOGLE_ID);
    if (!retained.some((attendee) => normalizeEmail(attendee.email) === normalizeEmail(replacementAttendee))) retained.push({ email: replacementAttendee });
    await googleJson(token, organizerUrl, "PATCH", { attendees: retained });
    return { mode: "unassigned", updatedEventId: eventId };
  }

  if (fullEvent.summary === "Absence avec prépa") throw new HttpError(409, "Cet événement a déjà été traité comme une absence");
  const removed = attendees.filter((attendee) => attendee.resource || RESOURCE_ID_PATTERN.test(attendee.email ?? ""));
  const originalResource = removed[0]?.displayName || removed[0]?.email || sourceResourceCalendarId;
  const originalSummary = fullEvent.summary ?? "Sans titre";
  const retained = attendees.filter((attendee) => !(attendee.resource || RESOURCE_ID_PATTERN.test(attendee.email ?? "")));
  await googleJson(token, organizerUrl, "PATCH", { attendees: retained, location: "" });
  const times = eventTimes(fullEvent);
  const absenceUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(ABSENCE_CALENDAR_GOOGLE_ID)}/events`);
  const absence = await googleJson(token, absenceUrl, "POST", {
    summary: "Absence avec prépa", description: `Absence avec prépa : ${originalSummary}`,
    ...times, attendees: [{ email: absenceAttendee }],
  });
  const replacementUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(REPLACEMENT_CALENDAR_GOOGLE_ID)}/events`);
  let description = `Remplacements : ${originalSummary} (${originalResource})`;
  if (fullEvent.description) description += `\n\nDescription d'origine :\n${fullEvent.description}`;
  try {
    const replacement = await googleJson(token, replacementUrl, "POST", {
      summary: "Remplacement", description, ...times, attendees: [{ email: replacementAttendee }],
    });
    return { mode: "standard", updatedEventId: eventId, absenceEventId: absence.id, replacementEventId: replacement.id };
  } catch {
    throw new HttpError(502, `L’absence a été créée (${String(absence.id ?? "ID inconnu")}), mais la création du remplacement a échoué. Vérifiez Google Calendar avant de réessayer.`);
  }
}

async function processReplacements(admin: SupabaseClient, body: Record<string, unknown>) {
  const connection = await sharedConnectionFor(admin);
  const resources = await replacementResources(admin, connection.id);
  const absenceAttendee = assertKnownResource(resources, body.resourceId, "resourceId");
  if (!Array.isArray(body.assignments) || !body.assignments.length) throw new HttpError(400, "Aucun remplacement fourni");
  if (body.assignments.length > 50) throw new HttpError(400, "Trop de remplacements en une seule fois");
  const results: Record<string, unknown>[] = [];
  let failed = 0;
  for (const assignment of body.assignments) {
    const item = (assignment ?? {}) as Record<string, unknown>;
    try {
      const outcome = await processReplacement(admin, connection.id, resources, {
        eventId: item.eventId,
        absenceAttendee,
        replacementAttendee: item.replacementResourceId,
      });
      results.push({ eventId: item.eventId, mode: outcome.mode, ok: true });
    } catch (error) {
      failed++;
      results.push({
        eventId: item.eventId, ok: false,
        error: error instanceof HttpError ? error.message : "Erreur de traitement",
      });
    }
  }
  const done = results.length - failed;
  return {
    results,
    message: failed === 0
      ? `${done} remplacement(s) enregistré(s).`
      : `${done} remplacement(s) enregistré(s), ${failed} en erreur.`,
  };
}

// Un attendee ressource "refusé" (responseStatus="declined") correspond à la ressource
// barrée dans Google Calendar : l'auto-acceptation a échoué et la salle/salarie n'est pas réservé.
async function declinedResourceEvents(admin: SupabaseClient) {
  const connection = await sharedConnectionFor(admin);
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);
  const { data: rows, error } = await admin.from("calendar_events")
    .select("google_event_id,summary,starts_at,ends_at,start_date,all_day,raw,calendars!inner(google_calendar_id,name)")
    .eq("calendars.connection_id", connection.id)
    .eq("calendars.is_resource", true)
    .eq("calendars.enabled", true)
    .neq("status", "cancelled")
    .or(`starts_at.gte.${nowIso},start_date.gte.${today}`)
    .order("starts_at", { ascending: true })
    .limit(400);
  if (error) throw error;
  const events: Record<string, unknown>[] = [];
  for (const row of rows ?? []) {
    const record = row as Record<string, unknown>;
    const calendar = record.calendars as { google_calendar_id: string; name: string };
    const raw = (record.raw ?? {}) as { attendees?: Array<{ email?: string; responseStatus?: string }>; htmlLink?: string };
    const attendees = Array.isArray(raw.attendees) ? raw.attendees : [];
    const declined = attendees.some((attendee) => normalizeEmail(attendee?.email) === normalizeEmail(calendar.google_calendar_id)
      && attendee.responseStatus === "declined");
    if (!declined) continue;
    events.push({
      eventId: String(record.google_event_id),
      calendarId: calendar.google_calendar_id,
      resourceName: calendar.name,
      title: record.summary ?? "Sans titre",
      startsAt: record.starts_at ?? record.start_date ?? "",
      endsAt: record.ends_at ?? "",
      allDay: Boolean(record.all_day),
      htmlLink: typeof raw.htmlLink === "string" && raw.htmlLink
        ? raw.htmlLink
        : `https://calendar.google.com/calendar/u/0/r/eventedit/${encodeURIComponent(String(record.google_event_id))}`,
    });
    if (events.length >= 100) break;
  }
  return { events };
}

async function repairResourceEvent(admin: SupabaseClient, body: Record<string, unknown>) {
  const connection = await sharedConnectionFor(admin);
  const resources = await replacementResources(admin, connection.id);
  const resourceCalendarId = assertKnownResource(resources, body.resourceCalendarId, "resourceCalendarId");
  const eventId = requiredString(body.eventId, "eventId", 1024).replace(/@google\.com$/i, "");
  const token = await getAccessToken(admin, connection.id);
  const sourceUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(resourceCalendarId)}/events/${encodeURIComponent(eventId)}`);
  const sourceEvent = await googleJson(token, sourceUrl) as GoogleEvent;
  const organizerId = requiredString(sourceEvent.organizer?.email, "organisateur Google");
  const organizerUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(organizerId)}/events/${encodeURIComponent(eventId)}`);
  const fullEvent = await googleJson(token, organizerUrl) as GoogleEvent;
  const attendees = Array.isArray(fullEvent.attendees)
    ? fullEvent.attendees.filter((attendee) => normalizeEmail(attendee.email) !== normalizeEmail(resourceCalendarId))
    : [];
  // Retirer puis re-remettre la ressource : son calendrier re-traite l'invitation
  // et l'auto-acceptation rejoue, exactement comme la correction manuelle.
  attendees.push({ email: resourceCalendarId });
  await googleJson(token, organizerUrl, "PATCH", { attendees });
  return { ok: true, updatedEventId: eventId };
}

// Resynchronisation complète : force le passage full (attendees/htmlLink inclus) même
// quand un sync_token incrémental existe déjà, ex. pour amorcer la détection ci-dessus.
async function resyncAll(admin: SupabaseClient) {
  const connection = await sharedConnectionFor(admin);
  const { error } = await admin.from("calendars").update({ sync_token: null })
    .eq("connection_id", connection.id).eq("is_resource", true).eq("enabled", true);
  if (error) throw error;
  return syncConnection(admin, { id: connection.id });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    if (req.method !== "POST") throw new HttpError(405, "Méthode non autorisée");
    const body = await req.json().catch(() => ({}));
    const { user, role, admin } = await requireActiveUser(req);
    if (body.action === "sync") {
      return json(role === "admin"
        ? await sync(admin, body.calendarIds)
        : await syncEmployeeCalendar(admin, user.id, body.mode));
    }
    if (role !== "admin") throw new HttpError(403, "Accès administrateur requis");
    if (body.action === "connectionInfo") {
      const { data: connection } = await admin.from("google_connections")
        .select("google_account_email,connected_at").is("revoked_at", null)
        .order("connected_at", { ascending: true }).limit(1).maybeSingle();
      return json({
        connected: Boolean(connection),
        email: connection?.google_account_email ?? null,
        connectedAt: connection?.connected_at ?? null,
      });
    }
    if (body.action === "discover") return json(await discover(admin));
    if (body.action === "resources") {
      const connection = await sharedConnectionFor(admin);
      return json({ resources: await resourcePayload(admin, connection.id) });
    }
    if (body.action === "coefficientCalendars") {
      const connection = await sharedConnectionFor(admin);
      const token = await getAccessToken(admin, connection.id);
      await refreshCoefficientCalendarMetadata(admin, connection.id, await listGoogleCalendars(token));
      return json({ calendars: await coefficientPayload(admin, connection.id) });
    }
    if (body.action === "independentEvents") return json(await independentEvents(admin, body.schoolYear));
    if (body.action === "createIndependentInvoice") return json(await createIndependentInvoice(admin, user.id, body));
    if (body.action === "independentInvoices") return json(await independentInvoices(admin, body.employeeId));
    if (body.action === "updateIndependentInvoice") return json(await updateIndependentInvoice(admin, user.id, body));
    if (body.action === "deleteIndependentInvoice") return json(await deleteIndependentInvoice(admin, user.id, body));
    if (body.action === "unassignedEvents") return json(await unassignedEvents(admin));
    if (body.action === "replacementMonthEvents") {
      const connection = await sharedConnectionFor(admin);
      return json(await replacementMonthEvents(admin, connection.id, body));
    }
    if (body.action === "replacementAvailability") {
      const connection = await sharedConnectionFor(admin);
      return json(await replacementAvailability(admin, connection.id, body));
    }
    if (body.action === "processReplacements") return json(await processReplacements(admin, body));
    if (body.action === "declinedResourceEvents") return json(await declinedResourceEvents(admin));
    if (body.action === "repairResourceEvent") return json(await repairResourceEvent(admin, body));
    if (body.action === "resyncAll") return json(await resyncAll(admin));
    if (body.action === "saveResources") return json(await saveResources(admin, body.resources));
    if (body.action === "saveCoefficients") return json(await saveCoefficients(admin, body.calendars));
    throw new HttpError(400, "Action attendue: discover, resources, coefficientCalendars, unassignedEvents, independentEvents, createIndependentInvoice, saveResources, saveCoefficients ou sync");
  } catch (error) {
    return errorResponse(error);
  }
});
