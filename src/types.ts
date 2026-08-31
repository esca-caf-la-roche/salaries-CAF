export type UserRole = 'admin' | 'employee'

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
  userId?: string | null
  eventCount?: number
  lastSyncedAt?: string | null
}

export interface MonthlyHours {
  month: number
  rawHours: number
  weightedHours: number
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
