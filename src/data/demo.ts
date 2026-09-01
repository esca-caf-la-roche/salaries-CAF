import type { AppUser, EmployeeResource, EmployeeSummary, SyncState, UsedCalendarCoefficient } from '../types'

export const demoUser: AppUser = {
  id: 'demo-admin',
  email: 'admin.demo@caf.local',
  displayName: 'Admin CAF',
  role: 'admin',
}

export const demoResources: EmployeeResource[] = [
  { id: 'employee-1', calendarId: 'cal-1', googleCalendarId: 'demo-beatrice@resource.calendar.google.com', name: '(CDI)-Béatrice Martin', color: '#e26d3f', enabled: true, loginEmail: 'beatrice@example.fr', contractType: 'CDI', annualContractHours: 1607, isUnassignedResource: false, eventCount: 42, lastSyncedAt: '2026-08-31T08:45:00Z' },
  { id: 'employee-2', calendarId: 'cal-2', googleCalendarId: 'demo-paul@resource.calendar.google.com', name: '(CDII)-Paul Renaud', color: '#3f7f73', enabled: true, loginEmail: 'paul@example.fr', contractType: 'CDII', annualContractHours: 820, isUnassignedResource: false, eventCount: 36, lastSyncedAt: '2026-08-31T08:45:00Z' },
  { id: 'employee-3', calendarId: 'cal-3', googleCalendarId: 'demo-indetermine@resource.calendar.google.com', name: '(CDII)-A DETERMINER', color: '#4d6f8a', enabled: true, loginEmail: '', contractType: null, annualContractHours: null, isUnassignedResource: true, eventCount: 18, lastSyncedAt: null },
]

export const demoCoefficientCalendars: UsedCalendarCoefficient[] = [
  { googleCalendarId: 'demo-avec-prepa@group.calendar.google.com', name: 'Cours avec prépa', color: '#7986cb', coefficient: 1.25, hourCategory: 'contract', eventCount: 54 },
  { googleCalendarId: 'demo-sans-prepa@group.calendar.google.com', name: 'Absences', color: '#f6bf26', coefficient: 1, hourCategory: 'absence', eventCount: 17 },
]

const seriesA = [62, 71, 68, 74, 79, 66, 42, 38, 72, 76, 69, 55]
const seriesB = [48, 51, 58, 61, 55, 63, 36, 31, 57, 60, 54, 44]

export const demoEmployees: EmployeeSummary[] = [
  {
    id: 'employee-1',
    name: 'Béatrice Martin',
    calendarName: 'Béatrice · Coordination',
    monthlyHours: seriesA.map((hours, index) => ({ month: index + 1, rawHours: hours, weightedHours: hours, contractHours: hours, absenceHours: 0, replacementHours: 0, publicHolidayHours: 0, eventCount: Math.round(hours / 2.4) })),
  },
  {
    id: 'employee-2',
    name: 'Paul Renaud',
    calendarName: 'Paul · Encadrement',
    monthlyHours: seriesB.map((hours, index) => ({ month: index + 1, rawHours: hours, weightedHours: hours * 1.25, contractHours: hours * 1.25, absenceHours: 0, replacementHours: 0, publicHolidayHours: 0, eventCount: Math.round(hours / 2.2) })),
  },
]

export const demoSyncState: SyncState = {
  status: 'success',
  lastSyncedAt: '2026-08-31T08:45:00Z',
  message: 'Données de démonstration',
}
