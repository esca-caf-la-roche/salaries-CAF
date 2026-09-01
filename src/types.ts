export type UserRole = 'admin' | 'employee'
export type ContractType = 'CDI' | 'CDII' | 'CDD'
export type HourType =
  | 'work_with_prep'
  | 'work_without_prep'
  | 'absence_with_prep'
  | 'absence_without_prep'
  | 'replacement_with_prep'
  | 'replacement_without_prep'
  | 'public_holiday_with_prep'

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
  coefficient: PreparationCoefficient | null
  hourType: HourType | null
  eventCount: number
}

export interface MonthlyHours {
  month: number
  rawHours: number
  weightedHours: number
  workWithPrepHours: number
  workWithoutPrepHours: number
  absenceWithPrepHours: number
  absenceWithoutPrepHours: number
  replacementWithPrepHours: number
  replacementWithoutPrepHours: number
  publicHolidayWithPrepHours: number
  eventCount: number
}

export interface EmployeeSummary {
  id: string
  name: string
  calendarName: string
  monthlyHours: MonthlyHours[]
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'success' | 'error'
  lastSyncedAt: string | null
  message?: string
}
