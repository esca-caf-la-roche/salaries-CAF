import { demoCoefficientCalendars, demoEmployees, demoResources, demoSyncState } from '../data/demo'
import { isDemoMode, supabase } from '../lib/supabase'
import { detectContractType } from '../lib/contracts'
import type { EmployeeResource, EmployeeSummary, MonthlyHours, SyncState, UsedCalendarCoefficient } from '../types'

const pause = (milliseconds = 180) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

function mapResource(resource: Record<string, unknown>): EmployeeResource {
  const name = String(resource.name)
  const detectedContractType = detectContractType(name)
  return {
    id: String(resource.id),
    calendarId: String(resource.calendar_id),
    googleCalendarId: String(resource.google_calendar_id),
    name,
    color: String(resource.color ?? '#3f7f73'),
    enabled: Boolean(resource.enabled),
    loginEmail: String(resource.login_email ?? ''),
    contractType: detectedContractType,
    annualContractHours: resource.annual_contract_hours == null ? null : Number(resource.annual_contract_hours),
    isUnassignedResource: Boolean(resource.is_unassigned_resource),
    userId: resource.user_id ? String(resource.user_id) : null,
    eventCount: Number(resource.event_count ?? 0),
    lastSyncedAt: resource.last_synced_at ? String(resource.last_synced_at) : null,
  }
}

function mapCoefficientCalendar(calendar: Record<string, unknown>): UsedCalendarCoefficient {
  const coefficient = calendar.coefficient == null ? null : Number(calendar.coefficient)
  const supportedHourCategories = ['contract', 'absence', 'replacement', 'public_holiday']
  return {
    googleCalendarId: String(calendar.google_calendar_id),
    name: String(calendar.label ?? calendar.google_calendar_id),
    coefficient: coefficient === 1 || coefficient === 1.25 ? coefficient : null,
    hourCategory: supportedHourCategories.includes(String(calendar.hour_category))
      ? calendar.hour_category as UsedCalendarCoefficient['hourCategory']
      : null,
    eventCount: Number(calendar.event_count ?? 0),
  }
}

export async function getResources(): Promise<EmployeeResource[]> {
  if (isDemoMode || !supabase) {
    await pause()
    return structuredClone(demoResources)
  }
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: { action: 'resources' },
  })
  if (error) throw error
  return (data?.resources ?? []).map(mapResource)
}

export async function saveResources(resources: EmployeeResource[]): Promise<EmployeeResource[]> {
  if (isDemoMode || !supabase) {
    await pause()
    return structuredClone(resources)
  }
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: {
      action: 'saveResources',
      resources: resources.map((resource) => ({
        id: resource.id,
        enabled: resource.enabled,
        loginEmail: resource.loginEmail,
        annualContractHours: resource.annualContractHours,
      })),
    },
  })
  if (error) throw error
  return (data?.resources ?? []).map(mapResource)
}

export async function discoverResources(): Promise<EmployeeResource[]> {
  if (isDemoMode || !supabase) {
    await pause(650)
    return structuredClone(demoResources)
  }
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: { action: 'discover' },
  })
  if (error) throw error
  return (data.resources ?? []).map(mapResource)
}

export async function getCoefficientCalendars(): Promise<UsedCalendarCoefficient[]> {
  if (isDemoMode || !supabase) {
    await pause()
    return structuredClone(demoCoefficientCalendars)
  }
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: { action: 'coefficientCalendars' },
  })
  if (error) throw error
  return (data?.calendars ?? []).map(mapCoefficientCalendar)
}

export async function saveCoefficientCalendars(calendars: UsedCalendarCoefficient[]): Promise<UsedCalendarCoefficient[]> {
  if (isDemoMode || !supabase) {
    await pause()
    return structuredClone(calendars)
  }
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: {
      action: 'saveCoefficients',
      calendars: calendars.map((calendar) => ({
        googleCalendarId: calendar.googleCalendarId,
        coefficient: calendar.coefficient,
        hourCategory: calendar.hourCategory,
      })),
    },
  })
  if (error) throw error
  return (data?.calendars ?? []).map(mapCoefficientCalendar)
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
  const unmapped = results.reduce((total: number, result: { unmappedEvents?: number }) => total + Number(result.unmappedEvents ?? 0), 0)
  return {
    status: failed.length ? 'error' : 'success',
    lastSyncedAt: new Date().toISOString(),
    message: failed.length
      ? `${synced} calendrier(s) synchronisé(s), ${failed.length} en erreur.`
      : `${synced} ressource(s) synchronisée(s).${unmapped ? ` ${unmapped} événement(s) ignoré(s) car leur calendrier d'origine n'a pas de catégorie d'heures et de coefficient définis.` : ''}`,
  }
}

export async function getEmployeeSummaries(schoolYear: number): Promise<EmployeeSummary[]> {
  if (isDemoMode || !supabase) {
    await pause()
    return structuredClone(demoEmployees)
  }
  const { data, error } = await supabase
    .from('monthly_hours')
    .select('employee_id, employee_name, calendar_name, month, raw_hours, weighted_hours, contract_hours, absence_hours, replacement_hours, public_holiday_hours, event_count')
    .eq('school_year', schoolYear)
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
      contractHours: Number(row.contract_hours ?? 0),
      absenceHours: Number(row.absence_hours ?? 0),
      replacementHours: Number(row.replacement_hours ?? 0),
      publicHolidayHours: Number(row.public_holiday_hours ?? 0),
      eventCount: row.event_count,
    })
    grouped.set(row.employee_id, employee)
  }
  return [...grouped.values()]
}
