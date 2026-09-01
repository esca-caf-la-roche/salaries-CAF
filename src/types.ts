export type UserRole = 'admin' | 'employee'
export type ContractType = 'CDI' | 'CDII' | 'CDD'
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

export interface MonthlyHours {
  month: number
  rawHours: number
  weightedHours: number
  contractHours: number
  absenceHours: number
  replacementHours: number
  publicHolidayHours: number
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
