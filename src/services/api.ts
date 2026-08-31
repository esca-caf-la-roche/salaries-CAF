import { demoCalendars, demoEmployees, demoSyncState } from '../data/demo'
import { isDemoMode, supabase } from '../lib/supabase'
import type { CalendarResource, EmployeeSummary, MonthlyHours, SyncState } from '../types'

const pause = (milliseconds = 180) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

export async function getCalendars(): Promise<CalendarResource[]> {
  if (isDemoMode || !supabase) {
    await pause()
    return structuredClone(demoCalendars)
  }
  const { data, error } = await supabase.from('calendars').select('*').order('name')
  if (error) throw error
  return (data ?? []).map((calendar) => ({
    id: calendar.id,
    googleCalendarId: calendar.google_calendar_id,
    name: calendar.name,
    color: calendar.color ?? '#3f7f73',
    enabled: calendar.enabled,
    coefficient: Number(calendar.coefficient),
    eventCount: calendar.event_count,
    lastSyncedAt: calendar.last_synced_at,
  }))
}

export async function updateCalendar(calendar: CalendarResource): Promise<void> {
  if (isDemoMode || !supabase) {
    await pause()
    return
  }
  const { error } = await supabase.from('calendars').update({
    enabled: calendar.enabled,
    coefficient: calendar.coefficient,
  }).eq('id', calendar.id)
  if (error) throw error
}

export async function discoverCalendars(): Promise<CalendarResource[]> {
  if (isDemoMode || !supabase) {
    await pause(650)
    return structuredClone(demoCalendars)
  }
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: { action: 'discover' },
  })
  if (error) throw error
  return (data.calendars ?? []).map((calendar: Record<string, unknown>) => ({
    id: String(calendar.id),
    googleCalendarId: String(calendar.google_calendar_id),
    name: String(calendar.name),
    color: String(calendar.color ?? '#3f7f73'),
    enabled: Boolean(calendar.enabled),
    coefficient: Number(calendar.coefficient),
    eventCount: Number(calendar.event_count ?? 0),
    lastSyncedAt: calendar.last_synced_at ? String(calendar.last_synced_at) : null,
  }))
}

export async function startGoogleConnection(): Promise<void> {
  if (isDemoMode || !supabase) {
    await pause()
    return
  }
  const { data, error } = await supabase.functions.invoke('google-oauth-start', {
    body: { redirectTo: window.location.href },
  })
  if (error) throw error
  if (!data?.authorizationUrl) throw new Error('Google n\'a pas renvoyé d\'URL de connexion.')
  window.location.assign(data.authorizationUrl)
}

export async function runIncrementalSync(): Promise<SyncState> {
  if (isDemoMode || !supabase) {
    await pause(850)
    return { ...demoSyncState, lastSyncedAt: new Date().toISOString() }
  }
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: { action: 'sync' },
  })
  if (error) throw error
  const results = Array.isArray(data?.results) ? data.results : []
  const failed = results.filter((result: { error?: string }) => result.error)
  const synced = results.length - failed.length
  return {
    status: failed.length ? 'error' : 'success',
    lastSyncedAt: new Date().toISOString(),
    message: failed.length
      ? `${synced} calendrier(s) synchronisé(s), ${failed.length} en erreur.`
      : `${synced} calendrier(s) synchronisé(s).`,
  }
}

export async function getEmployeeSummaries(year: number): Promise<EmployeeSummary[]> {
  if (isDemoMode || !supabase) {
    await pause()
    return structuredClone(demoEmployees)
  }
  const { data, error } = await supabase
    .from('monthly_hours')
    .select('employee_id, employee_name, calendar_name, month, raw_hours, weighted_hours, event_count')
    .eq('year', year)
    .order('month')
  if (error) throw error

  const grouped = new Map<string, EmployeeSummary>()
  for (const row of data ?? []) {
    const employee = grouped.get(row.employee_id) ?? {
      id: row.employee_id,
      name: row.employee_name,
      calendarName: row.calendar_name,
      monthlyHours: [] as MonthlyHours[],
    }
    employee.monthlyHours.push({
      month: row.month,
      rawHours: Number(row.raw_hours),
      weightedHours: Number(row.weighted_hours),
      eventCount: row.event_count,
    })
    grouped.set(row.employee_id, employee)
  }
  return [...grouped.values()]
}
