import { FunctionsHttpError } from '@supabase/supabase-js'
import { demoCoefficientCalendars, demoEmployees, demoResources, demoSyncState, demoUnassignedEvents } from '../data/demo'
import { isDemoMode, supabase } from '../lib/supabase'
import { detectContractType } from '../lib/contracts'
import type {
  EmployeeResource,
  EmployeeSummary,
  MonthlyEventHour,
  MonthlyPayrollEntry,
  SchoolYearSettings,
  SyncState,
  UnassignedEvent,
  UsedCalendarCoefficient,
} from '../types'

const pause = (milliseconds = 180) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

async function throwFunctionError(error: unknown, fallback: string): Promise<never> {
  if (error instanceof FunctionsHttpError) {
    const payload = await error.context.clone().json().catch(() => null) as { error?: unknown } | null
    if (typeof payload?.error === 'string' && payload.error.trim()) throw new Error(payload.error)
  }
  throw new Error(error instanceof Error && error.message ? error.message : fallback)
}

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
  const color = typeof calendar.color === 'string' && /^#[0-9a-f]{6}$/i.test(calendar.color.trim())
    ? calendar.color.trim()
    : null
  const supportedHourCategories = ['contract', 'absence', 'replacement', 'public_holiday']
  return {
    googleCalendarId: String(calendar.google_calendar_id),
    name: String(calendar.label ?? calendar.google_calendar_id),
    color,
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
  if (error) await throwFunctionError(error, 'Les ressources n\'ont pas pu être chargées.')
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

export async function getUnassignedEvents(): Promise<UnassignedEvent[]> {
  if (isDemoMode || !supabase) {
    await pause()
    return structuredClone(demoUnassignedEvents)
  }
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: { action: 'unassignedEvents' },
  })
  if (error) await throwFunctionError(error, 'Les ressources n\'ont pas pu être enregistrées.')
  return (data?.events ?? []) as UnassignedEvent[]
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
  const [employeesResult, hoursResult, settingsResult, payrollResult, weeksResult] = await Promise.all([
    supabase.from('employees')
      .select('id, display_name, contract_type, annual_contract_hours')
      .eq('active', true)
      .eq('is_unassigned_resource', false)
      .order('display_name'),
    supabase.from('monthly_hours')
      .select('employee_id, employee_name, calendar_name, month, raw_hours, weighted_hours, contract_hours, absence_hours, replacement_hours, public_holiday_hours, contract_with_prep_hours, contract_without_prep_hours, absence_with_prep_hours, absence_without_prep_hours, replacement_with_prep_hours, replacement_without_prep_hours, public_holiday_with_prep_hours, public_holiday_without_prep_hours, worked_weeks, event_count')
      .eq('school_year', schoolYear),
    supabase.from('employee_school_year_settings')
      .select('employee_id, contract_type, annual_contract_minutes, full_time_annual_minutes, paid_months')
      .eq('school_year', schoolYear),
    supabase.from('employee_monthly_payroll')
      .select('employee_id, month, paid_minutes, paid_leave_minutes')
      .eq('school_year', schoolYear),
    supabase.from('employee_school_year_weeks')
      .select('employee_id, worked_weeks')
      .eq('school_year', schoolYear),
  ])
  if (employeesResult.error) throw employeesResult.error
  if (hoursResult.error) throw hoursResult.error
  if (settingsResult.error) throw settingsResult.error
  if (payrollResult.error) throw payrollResult.error
  if (weeksResult.error) throw weeksResult.error

  const settingsByEmployee = new Map((settingsResult.data ?? []).map((row) => [row.employee_id, row]))
  const weeksByEmployee = new Map((weeksResult.data ?? []).map((row) => [row.employee_id, Number(row.worked_weeks)]))
  const payrollByEmployee = new Map<string, MonthlyPayrollEntry[]>()
  for (const row of payrollResult.data ?? []) {
    const entries = payrollByEmployee.get(row.employee_id) ?? []
    entries.push({ month: row.month, paidMinutes: row.paid_minutes, paidLeaveMinutes: row.paid_leave_minutes })
    payrollByEmployee.set(row.employee_id, entries)
  }

  const grouped = new Map<string, EmployeeSummary>()
  for (const row of employeesResult.data ?? []) {
    if (!row.contract_type || (row.contract_type !== 'INDEP' && row.annual_contract_hours == null)) continue
    const saved = settingsByEmployee.get(row.id)
    const contractType = row.contract_type === 'INDEP' ? 'INDEP' : saved?.contract_type ?? row.contract_type
    grouped.set(row.id, {
      id: row.id,
      name: row.display_name,
      calendarName: '',
      contractType,
      annualContractHours: Number(saved?.annual_contract_minutes ?? Math.round(Number(row.annual_contract_hours) * 60)) / 60,
      annualWorkedWeeks: weeksByEmployee.get(row.id) ?? 0,
      monthlyHours: [],
      payroll: payrollByEmployee.get(row.id) ?? [],
      settings: {
        contractType,
        annualContractMinutes: saved?.annual_contract_minutes ?? Math.round(Number(row.annual_contract_hours) * 60),
        fullTimeAnnualMinutes: saved?.full_time_annual_minutes ?? 1582 * 60,
        paidMonths: saved?.paid_months ?? 12,
      },
    })
  }

  for (const row of hoursResult.data ?? []) {
    const employee = grouped.get(row.employee_id)
    if (!employee) continue
    employee.calendarName = row.calendar_name
    employee.monthlyHours.push({
      month: row.month,
      rawHours: Number(row.raw_hours),
      weightedHours: Number(row.weighted_hours),
      contractHours: Number(row.contract_hours ?? 0),
      absenceHours: Number(row.absence_hours ?? 0),
      replacementHours: Number(row.replacement_hours ?? 0),
      publicHolidayHours: Number(row.public_holiday_hours ?? 0),
      contractWithPrepHours: Number(row.contract_with_prep_hours ?? 0),
      contractWithoutPrepHours: Number(row.contract_without_prep_hours ?? 0),
      absenceWithPrepHours: Number(row.absence_with_prep_hours ?? 0),
      absenceWithoutPrepHours: Number(row.absence_without_prep_hours ?? 0),
      replacementWithPrepHours: Number(row.replacement_with_prep_hours ?? 0),
      replacementWithoutPrepHours: Number(row.replacement_without_prep_hours ?? 0),
      publicHolidayWithPrepHours: Number(row.public_holiday_with_prep_hours ?? 0),
      publicHolidayWithoutPrepHours: Number(row.public_holiday_without_prep_hours ?? 0),
      workedWeeks: Number(row.worked_weeks ?? 0),
      eventCount: row.event_count,
    })
  }
  return [...grouped.values()]
}

export async function getMonthlyEventHours(employeeId: string, schoolYear: number, month: number): Promise<MonthlyEventHour[]> {
  if (isDemoMode || !supabase) {
    await pause()
    return []
  }
  const { data, error } = await supabase
    .from('monthly_event_hours')
    .select('event_id, title, calendar_name, calendar_color, starts_at, ends_at, raw_hours, weighted_hours, coefficient, hour_category, has_preparation')
    .eq('employee_id', employeeId)
    .eq('school_year', schoolYear)
    .eq('month', month)
    .order('starts_at')
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.event_id,
    title: row.title ?? 'Sans objet',
    calendarName: row.calendar_name,
    calendarColor: row.calendar_color,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    rawHours: Number(row.raw_hours),
    weightedHours: Number(row.weighted_hours),
    coefficient: Number(row.coefficient) === 1.25 ? 1.25 : 1,
    hourCategory: row.hour_category,
    hasPreparation: row.has_preparation,
  }))
}

export async function saveAnnualTracking(
  employeeId: string,
  schoolYear: number,
  settings: SchoolYearSettings,
  payroll: MonthlyPayrollEntry[],
): Promise<void> {
  if (isDemoMode || !supabase) {
    await pause()
    return
  }
  const { error: settingsError } = await supabase.from('employee_school_year_settings').upsert({
    employee_id: employeeId,
    school_year: schoolYear,
    contract_type: settings.contractType,
    annual_contract_minutes: settings.annualContractMinutes,
    full_time_annual_minutes: settings.fullTimeAnnualMinutes,
    paid_months: settings.paidMonths,
  }, { onConflict: 'employee_id,school_year' })
  if (settingsError) throw settingsError

  const { error: payrollError } = await supabase.from('employee_monthly_payroll').upsert(
    payroll.map((entry) => ({
      employee_id: employeeId,
      school_year: schoolYear,
      month: entry.month,
      paid_minutes: entry.paidMinutes,
      paid_leave_minutes: entry.paidLeaveMinutes,
    })),
    { onConflict: 'employee_id,school_year,month' },
  )
  if (payrollError) throw payrollError
}
