import type { AppUser, CalendarResource, EmployeeSummary, SyncState } from '../types'

export const demoUser: AppUser = {
  id: 'demo-admin',
  email: 'admin.demo@caf.local',
  displayName: 'Admin CAF',
  role: 'admin',
}

export const demoCalendars: CalendarResource[] = [
  { id: 'cal-1', googleCalendarId: 'demo-beatrice', name: 'Béatrice · Coordination', color: '#e26d3f', enabled: true, coefficient: 1, eventCount: 42, lastSyncedAt: '2026-08-31T08:45:00Z' },
  { id: 'cal-2', googleCalendarId: 'demo-paul', name: 'Paul · Encadrement', color: '#3f7f73', enabled: true, coefficient: 1.25, eventCount: 36, lastSyncedAt: '2026-08-31T08:45:00Z' },
  { id: 'cal-3', googleCalendarId: 'demo-reunions', name: 'Équipe · Réunions', color: '#4d6f8a', enabled: false, coefficient: 0.5, eventCount: 18, lastSyncedAt: null },
]

const seriesA = [62, 71, 68, 74, 79, 66, 42, 38, 72, 76, 69, 55]
const seriesB = [48, 51, 58, 61, 55, 63, 36, 31, 57, 60, 54, 44]

export const demoEmployees: EmployeeSummary[] = [
  {
    id: 'employee-1',
    name: 'Béatrice Martin',
    calendarName: 'Béatrice · Coordination',
    monthlyHours: seriesA.map((hours, index) => ({ month: index + 1, rawHours: hours, weightedHours: hours, eventCount: Math.round(hours / 2.4) })),
  },
  {
    id: 'employee-2',
    name: 'Paul Renaud',
    calendarName: 'Paul · Encadrement',
    monthlyHours: seriesB.map((hours, index) => ({ month: index + 1, rawHours: hours, weightedHours: hours * 1.25, eventCount: Math.round(hours / 2.2) })),
  },
]

export const demoSyncState: SyncState = {
  status: 'success',
  lastSyncedAt: '2026-08-31T08:45:00Z',
  message: 'Données de démonstration',
}
