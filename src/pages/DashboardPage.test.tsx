import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'

const getEmployeeSummaries = vi.fn()
const getCoefficientCalendars = vi.fn()
const runIncrementalSync = vi.fn()

vi.mock('../services/api', () => ({
  getEmployeeSummaries: (...args: unknown[]) => getEmployeeSummaries(...args),
  getCoefficientCalendars: (...args: unknown[]) => getCoefficientCalendars(...args),
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
    getCoefficientCalendars.mockResolvedValue([
      { googleCalendarId: 'unknown@group.calendar.google.com', name: 'Nouveau calendrier', coefficient: null, hourType: null, eventCount: 3 },
    ])
  })

  it('warns admins when a used calendar still needs configuration', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    expect(await screen.findByText('Configuration incomplète.', { exact: false })).toBeInTheDocument()
    expect(screen.getByText("1 type d'heures à définir", { exact: false })).toBeInTheDocument()
    expect(screen.getByText('1 coefficient à définir', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Configurer les calendriers' })).toHaveAttribute('href', '/configuration#calendriers-utilises')
  })
})
