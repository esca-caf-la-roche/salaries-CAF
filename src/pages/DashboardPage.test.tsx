import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'
import type { EmployeeSummary } from '../types'

const getEmployeeSummaries = vi.fn()
const getCoefficientCalendars = vi.fn()
const getUnassignedEvents = vi.fn()
const runIncrementalSync = vi.fn()

const trackedEmployee: EmployeeSummary = {
  id: 'employee-1',
  name: 'Salarié Test',
  calendarName: 'Calendrier Test',
  contractType: 'CDI',
  annualContractHours: 925,
  annualWorkedWeeks: 1,
  settings: { contractType: 'CDI', annualContractMinutes: 925 * 60, fullTimeAnnualMinutes: 1582 * 60, paidMonths: 12 },
  payroll: [],
  monthlyHours: [{
    month: 9,
    rawHours: 54 + 23 / 60,
    weightedHours: 54 + 23 / 60,
    contractHours: 48 + 8 / 60,
    absenceHours: 6 + 15 / 60,
    replacementHours: 0,
    publicHolidayHours: 0,
    contractWithPrepHours: 48 + 8 / 60,
    contractWithoutPrepHours: 0,
    absenceWithPrepHours: 6 + 15 / 60,
    absenceWithoutPrepHours: 0,
    replacementWithPrepHours: 0,
    replacementWithoutPrepHours: 0,
    publicHolidayWithPrepHours: 0,
    publicHolidayWithoutPrepHours: 0,
    workedWeeks: 1,
    eventCount: 22,
  }],
}

vi.mock('../services/api', () => ({
  getEmployeeSummaries: (...args: unknown[]) => getEmployeeSummaries(...args),
  getCoefficientCalendars: (...args: unknown[]) => getCoefficientCalendars(...args),
  getUnassignedEvents: (...args: unknown[]) => getUnassignedEvents(...args),
  runIncrementalSync: (...args: unknown[]) => runIncrementalSync(...args),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', role: 'admin', email: 'admin@example.fr', displayName: 'Admin' } }),
}))

describe('DashboardPage', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    getEmployeeSummaries.mockResolvedValue([])
    getUnassignedEvents.mockResolvedValue([])
    runIncrementalSync.mockResolvedValue({ status: 'success', lastSyncedAt: '2026-09-01T08:00:00Z' })
    getCoefficientCalendars.mockResolvedValue([
      { googleCalendarId: 'unknown@group.calendar.google.com', name: 'Nouveau calendrier', coefficient: null, hourCategory: null, eventCount: 3 },
    ])
  })

  it('warns admins when a used calendar still needs configuration', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    expect(await screen.findByText('Configuration incomplète.', { exact: false })).toBeInTheDocument()
    expect(screen.getByText("1 type d'heures à définir", { exact: false })).toBeInTheDocument()
    expect(screen.getByText('1 coefficient à définir', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Configurer les calendriers' })).toHaveAttribute('href', '/configuration#calendriers-utilises')
    expect(screen.getByRole('columnheader', { name: 'Heures du contrat' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: "Heures d'absences" })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Heures de remplacements' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Heures fériées' })).toBeInTheDocument()
  })

  it('uses the net business formula for retained hours', async () => {
    getEmployeeSummaries.mockResolvedValue([structuredClone(trackedEmployee)])
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    await screen.findByRole('option', { name: 'Salarié Test' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Période' }), { target: { value: '9' } })
    const employeeRow = await screen.findByRole('row', { name: /Salarié Test/ })
    expect(within(employeeRow).getByText('41,9 h')).toBeInTheDocument()
  })

  it('shows a red warning when an unassigned event starts in less than seven days', async () => {
    const now = new Date()
    const startsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()
    getUnassignedEvents.mockResolvedValue([{
      id: 'event-urgent', googleEventId: 'google-urgent', title: 'Cours urgent', description: '', location: '',
      startsAt, endsAt: new Date(Date.parse(startsAt) + 2 * 60 * 60 * 1000).toISOString(), allDay: false,
      sourceCalendarId: 'cours@example.fr', sourceCalendarName: 'Cours', sourceCalendarColor: '#7986cb',
    }])

    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    expect(await screen.findByText('1 événement à attribuer dans moins de 7 jours.', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voir les événements' })).toHaveAttribute('href', '/a-determiner')
  })

  it('refreshes unassigned events after a manual Google synchronization', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    await waitFor(() => expect(getUnassignedEvents).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Actualiser Google' }))

    await waitFor(() => expect(runIncrementalSync).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(getUnassignedEvents).toHaveBeenCalledTimes(2))
  })
})
