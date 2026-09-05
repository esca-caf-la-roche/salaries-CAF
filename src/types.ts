export type UserRole = 'admin' | 'employee'
export type ContractType = 'CDI' | 'CDII' | 'CDD' | 'INDEP'
export type HourCategory = 'contract' | 'absence' | 'replacement' | 'public_holiday'

export interface AppUser {
  id: string
  email: string
  displayName: string
  role: UserRole
}

export interface EmployeeResource {
  id: string
  calendarId: string
  googleCalendarId: string
  name: string
  color: string
  enabled: boolean
  loginEmail: string
  contractType: ContractType | null
  annualContractHours: number | null
  isUnassignedResource: boolean
  userId?: string | null
  eventCount?: number
  lastSyncedAt?: string | null
}

export type PreparationCoefficient = 1 | 1.25

export interface UsedCalendarCoefficient {
  googleCalendarId: string
  name: string
  color: string | null
  coefficient: PreparationCoefficient | null
  hourCategory: HourCategory | null
  eventCount: number
}

export interface UnassignedEvent {
  id: string
  googleEventId: string
  title: string
  description: string
  location: string
  startsAt: string
  endsAt: string
  allDay: boolean
  sourceCalendarId: string
  sourceCalendarName: string
  sourceCalendarColor: string | null
}

export interface MonthlyHours {
  month: number
  rawHours: number
  weightedHours: number
  contractHours: number
  absenceHours: number
  replacementHours: number
  publicHolidayHours: number
  contractWithPrepHours: number
  contractWithoutPrepHours: number
  absenceWithPrepHours: number
  absenceWithoutPrepHours: number
  replacementWithPrepHours: number
  replacementWithoutPrepHours: number
  publicHolidayWithPrepHours: number
  publicHolidayWithoutPrepHours: number
  workedWeeks: number
  eventCount: number
}

export interface MonthlyPayrollEntry {
  month: number
  paidMinutes: number
  paidLeaveMinutes: number
}

export interface SchoolYearSettings {
  contractType: ContractType
  annualContractMinutes: number
  fullTimeAnnualMinutes: number
  paidMonths: number
}

export interface MonthlyEventHour {
  id: string
  title: string
  calendarName: string
  calendarColor: string | null
  startsAt: string
  endsAt: string
  rawHours: number
  weightedHours: number
  coefficient: PreparationCoefficient
  hourCategory: HourCategory
  hasPreparation: boolean
}

export interface EmployeeSummary {
  id: string
  name: string
  calendarName: string
  contractType: ContractType
  annualContractHours: number
  annualWorkedWeeks: number
  monthlyHours: MonthlyHours[]
  payroll: MonthlyPayrollEntry[]
  settings: SchoolYearSettings
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'success' | 'error'
  lastSyncedAt: string | null
  message?: string
}
