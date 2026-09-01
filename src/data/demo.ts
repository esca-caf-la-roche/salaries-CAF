import type { AppUser, EmployeeResource, EmployeeSummary, SyncState, UnassignedEvent, UsedCalendarCoefficient } from '../types'

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

const demoEventDate = (daysFromToday: number, hour = 9) => {
  const date = new Date()
  date.setHours(hour, 0, 0, 0)
  date.setDate(date.getDate() + daysFromToday)
  return date.toISOString()
}

export const demoUnassignedEvents: UnassignedEvent[] = [
  {
    id: 'event-unassigned-1', googleEventId: 'google-event-unassigned-1', title: 'Cours jeunes — groupe découverte',
    description: 'Séance à attribuer. Le matériel pédagogique est déjà préparé.', location: 'Salle de bloc',
    startsAt: demoEventDate(3, 14), endsAt: demoEventDate(3, 16), allDay: false,
    sourceCalendarId: 'demo-avec-prepa@group.calendar.google.com', sourceCalendarName: 'Cours avec prépa', sourceCalendarColor: '#7986cb',
  },
  {
    id: 'event-unassigned-2', googleEventId: 'google-event-unassigned-2', title: 'Encadrement compétition départementale',
    description: 'Déplacement et encadrement de l’équipe jeunes.', location: 'Gymnase municipal',
    startsAt: demoEventDate(3, 17), endsAt: demoEventDate(3, 19), allDay: false,
    sourceCalendarId: 'demo-sans-prepa@group.calendar.google.com', sourceCalendarName: 'Absences', sourceCalendarColor: '#f6bf26',
  },
  {
    id: 'event-unassigned-3', googleEventId: 'google-event-unassigned-3', title: 'Stage vacances scolaires',
    description: '', location: 'La Cordée', startsAt: demoEventDate(35, 10), endsAt: demoEventDate(35, 17), allDay: false,
    sourceCalendarId: 'demo-avec-prepa@group.calendar.google.com', sourceCalendarName: 'Cours avec prépa', sourceCalendarColor: '#7986cb',
  },
]

const seriesA = [62, 71, 68, 74, 79, 66, 42, 38, 72, 76, 69, 55]
const seriesB = [48, 51, 58, 61, 55, 63, 36, 31, 57, 60, 54, 44]

export const demoEmployees: EmployeeSummary[] = [
  {
    id: 'employee-1',
    name: 'Béatrice Martin',
    calendarName: 'Béatrice · Coordination',
    contractType: 'CDI',
    annualContractHours: 925,
    annualWorkedWeeks: 36,
    settings: { contractType: 'CDI', annualContractMinutes: 925 * 60, fullTimeAnnualMinutes: 1582 * 60, paidMonths: 12 },
    payroll: schoolPayroll(85 * 60),
    monthlyHours: seriesA.map((hours, index) => monthlyDemoHours(hours, index)),
  },
  {
    id: 'employee-2',
    name: 'Paul Renaud',
    calendarName: 'Paul · Encadrement',
    contractType: 'CDII',
    annualContractHours: 820,
    annualWorkedWeeks: 33,
    settings: { contractType: 'CDII', annualContractMinutes: 820 * 60, fullTimeAnnualMinutes: 1582 * 60, paidMonths: 12 },
    payroll: schoolPayroll(Math.round(820 * 60 / 12)),
    monthlyHours: seriesB.map((hours, index) => monthlyDemoHours(hours, index, 1.25)),
  },
]

function schoolPayroll(paidMinutes: number) {
  return [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8].map((month) => ({ month, paidMinutes, paidLeaveMinutes: 0 }))
}

function monthlyDemoHours(hours: number, index: number, coefficient = 1) {
  const weighted = hours * coefficient
  return {
    month: index + 1,
    rawHours: hours,
    weightedHours: weighted,
    contractHours: weighted,
    absenceHours: 0,
    replacementHours: 0,
    publicHolidayHours: 0,
    contractWithPrepHours: coefficient === 1.25 ? weighted : 0,
    contractWithoutPrepHours: coefficient === 1 ? weighted : 0,
    absenceWithPrepHours: 0,
    absenceWithoutPrepHours: 0,
    replacementWithPrepHours: 0,
    replacementWithoutPrepHours: 0,
    publicHolidayWithPrepHours: 0,
    publicHolidayWithoutPrepHours: 0,
    workedWeeks: Math.max(1, Math.round(hours / 18)),
    eventCount: Math.round(hours / 2.4),
  }
}

export const demoSyncState: SyncState = {
  status: 'success',
  lastSyncedAt: '2026-08-31T08:45:00Z',
  message: 'Données de démonstration',
}
