import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'

const getEmployeeSummaries = vi.fn()
const getCoefficientCalendars = vi.fn()
const getUnassignedEvents = vi.fn()
const runIncrementalSync = vi.fn()

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
