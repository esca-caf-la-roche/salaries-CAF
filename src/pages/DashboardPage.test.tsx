import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'
import { buildWorkerRecap } from '../lib/workerRecap'
import type { ContractType, EmployeeSummary, MonthlyHours } from '../types'

const getEmployeeSummaries = vi.fn()
const getCoefficientCalendars = vi.fn()
const getUnassignedEvents = vi.fn()
const runIncrementalSync = vi.fn()
const getMonthlyTimeValidations = vi.fn()
const approveTimeMonthChange = vi.fn()
const getDeclinedResourceEvents = vi.fn()
const repairResourceEvent = vi.fn()

function employee(contractType: ContractType, annualContractHours: number, hours: Partial<MonthlyHours> = {}): EmployeeSummary {
  return {
    id: `employee-${contractType}`, name: contractType === 'INDEP' ? 'Alex Indépendant' : `Salarié ${contractType}`,
    calendarName: 'Calendrier Test', contractType, annualContractHours, paidMonths: contractType === 'CDII' ? 10 : 12, annualWorkedWeeks: 1,
    settings: { contractType, annualContractMinutes: annualContractHours * 60, fullTimeAnnualMinutes: 1582 * 60, paidMonths: 12 }, payroll: [],
    monthlyHours: [{ month: 9, rawHours: 0, weightedHours: 0, contractHours: 0, absenceHours: 0, replacementHours: 0, publicHolidayHours: 0, contractWithPrepHours: 0, contractWithoutPrepHours: 0, absenceWithPrepHours: 0, absenceWithoutPrepHours: 0, replacementWithPrepHours: 0, replacementWithoutPrepHours: 0, publicHolidayWithPrepHours: 0, publicHolidayWithoutPrepHours: 0, workedWeeks: 1, eventCount: 1, ...hours }],
  }
}

vi.mock('../services/api', () => ({
  getEmployeeSummaries: (...args: unknown[]) => getEmployeeSummaries(...args),
  getCoefficientCalendars: (...args: unknown[]) => getCoefficientCalendars(...args),
  getUnassignedEvents: (...args: unknown[]) => getUnassignedEvents(...args),
  runIncrementalSync: (...args: unknown[]) => runIncrementalSync(...args),
  getMonthlyTimeValidations: (...args: unknown[]) => getMonthlyTimeValidations(...args),
  approveTimeMonthChange: (...args: unknown[]) => approveTimeMonthChange(...args),
  getDeclinedResourceEvents: (...args: unknown[]) => getDeclinedResourceEvents(...args),
  repairResourceEvent: (...args: unknown[]) => repairResourceEvent(...args),
}))

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin-1', role: 'admin', email: 'admin@example.fr', displayName: 'Admin' } }) }))

describe('DashboardPage', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    getEmployeeSummaries.mockResolvedValue([])
    getUnassignedEvents.mockResolvedValue([])
    getCoefficientCalendars.mockResolvedValue([])
    getMonthlyTimeValidations.mockResolvedValue([])
    runIncrementalSync.mockResolvedValue({ status: 'success', lastSyncedAt: '2026-09-01T08:00:00Z', message: 'Données Google actualisées.' })
    approveTimeMonthChange.mockImplementation(async (employeeId: string, schoolYear: number, month: number) => ({ employeeId, schoolYear, month, status: 'validated', validatedAt: '2026-08-31T10:00:00Z', changeDetectedAt: null, changeCount: 1, approvedAt: '2026-09-06T10:00:00Z' }))
    getDeclinedResourceEvents.mockResolvedValue([])
    repairResourceEvent.mockResolvedValue(undefined)
  })

  it('calculates actual hours with the existing contract-specific rules', () => {
    expect(buildWorkerRecap(employee('CDI', 100, { contractHours: 90, absenceHours: 10, replacementHours: 5, publicHolidayHours: 3 }), 2026).actualHours).toBe(88)
    expect(buildWorkerRecap(employee('CDII', 100, { contractHours: 90, absenceHours: 10, replacementHours: 5, publicHolidayHours: 3 }), 2026).actualHours).toBe(103)
    expect(buildWorkerRecap(employee('INDEP', 0, { contractHours: 90, absenceHours: 10, replacementHours: 5, publicHolidayHours: 3 }), 2026).actualHours).toBe(108)
  })

  it('automatically synchronizes when an administrator opens the overview', async () => {
    let finishSync: ((value: unknown) => void) | undefined
    runIncrementalSync.mockImplementationOnce(() => new Promise((resolve) => { finishSync = resolve }))
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    expect(await screen.findByText('Synchronisation automatique en cours…')).toBeInTheDocument()
    expect(runIncrementalSync).toHaveBeenCalledWith('automatic')
    finishSync?.({ status: 'success', lastSyncedAt: '2026-09-24T10:00:00Z', message: 'Données Google actualisées.' })
    expect(await screen.findByText('Données Google actualisées.', { exact: false })).toBeInTheDocument()
  })

  it('keeps the existing overview visible when automatic synchronization fails', async () => {
    getEmployeeSummaries.mockResolvedValue([employee('CDI', 100)])
    runIncrementalSync.mockRejectedValueOnce(new Error('Google indisponible'))
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    expect(await screen.findByText('Salarié CDI')).toBeInTheDocument()
    expect(await screen.findByText('La synchronisation automatique a échoué. Les dernières données disponibles restent affichées.')).toBeInTheDocument()
  })

  it('shows every worker with annual contract, actual hours, colored difference and secondary details', async () => {
    getEmployeeSummaries.mockResolvedValue([
      employee('CDI', 100, { contractHours: 110, absenceHours: 2, replacementHours: 1, publicHolidayHours: 1 }),
      employee('CDII', 100, { contractHours: 80, absenceHours: 2, replacementHours: 3, publicHolidayHours: 1 }),
      employee('INDEP', 0, { contractHours: 42 }),
    ])
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    expect(await screen.findByText('Salarié CDI')).toBeInTheDocument()
    expect(screen.getByText('Alex Indépendant')).toBeInTheDocument()
    expect(screen.getByText('10 mois')).toBeInTheDocument()
    expect(screen.getByLabelText(/au-dessus du contrat/)).toHaveClass('worker-difference--positive')
    expect(screen.getByLabelText(/en dessous du contrat/)).toHaveClass('worker-difference--negative')
    expect(screen.getByLabelText('Sans objectif contractuel')).toHaveClass('worker-difference--neutral')
    expect(screen.getByLabelText('Détail des heures de Salarié CDI')).toHaveTextContent('Absence 2:00 hRemplacement 1:00 hJours fériés 1:00 h')
  })

  it('groups configuration and J-7 monitor gaps in the task board', async () => {
    const startsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    getCoefficientCalendars.mockResolvedValue([{ googleCalendarId: 'unknown', name: 'Nouveau calendrier', color: null, coefficient: null, hourCategory: null, eventCount: 3 }])
    getUnassignedEvents.mockResolvedValue([{ id: 'event-urgent', googleEventId: 'google-urgent', title: 'Cours urgent', description: '', location: '', startsAt, endsAt: new Date(Date.parse(startsAt) + 7200000).toISOString(), allDay: false, sourceCalendarId: 'cours', sourceCalendarName: 'Cours', sourceCalendarColor: '#7986cb' }])
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    const tasks = await screen.findByRole('region', { name: 'Tâches et alertes' })
    expect(tasks).toHaveTextContent('2 tâches demandent votre attention')
    expect(tasks).toHaveTextContent('Moniteur à déterminer')
    expect(tasks).toHaveTextContent('Configuration incomplète')
    expect(within(tasks).getByRole('link', { name: 'Attribuer' })).toHaveAttribute('href', '/a-determiner')
  })

  it('lists declined resource events as tasks and repairs them on demand', async () => {
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    getDeclinedResourceEvents.mockResolvedValue([
      { eventId: 'evt-declined', calendarId: 'salle-a@resource.calendar.google.com', resourceName: '(CDII)-Alice Martin', title: 'Cours du mardi', startsAt, endsAt: new Date(Date.parse(startsAt) + 7200000).toISOString(), allDay: false, htmlLink: 'https://calendar.google.com/event?eid=abc' },
    ])
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    const tasks = await screen.findByRole('region', { name: 'Tâches et alertes' })
    expect(tasks).toHaveTextContent('Ressource indisponible')
    expect(tasks).toHaveTextContent('(CDII)-Alice Martin')
    const seeLink = within(tasks).getByRole('link', { name: 'Ouvrir Cours du mardi dans Google Calendar' })
    expect(seeLink).toHaveAttribute('href', 'https://calendar.google.com/event?eid=abc')
    fireEvent.click(within(tasks).getByRole('button', { name: 'Corriger' }))
    await waitFor(() => expect(repairResourceEvent).toHaveBeenCalledWith('salle-a@resource.calendar.google.com', 'evt-declined'))
    await waitFor(() => expect(tasks).not.toHaveTextContent('Ressource indisponible'))
  })

  it('refreshes declined-resource tasks through the single sync button', async () => {
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    getDeclinedResourceEvents
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ eventId: 'evt-2', calendarId: 'c1', resourceName: '(CDII)-Alice Martin', title: 'Cours du mardi', startsAt, endsAt: new Date(Date.parse(startsAt) + 7200000).toISOString(), allDay: false, htmlLink: 'https://calendar.google.com/x' }])
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    await waitFor(() => expect(runIncrementalSync).toHaveBeenCalledWith('automatic'))
    await waitFor(() => expect(getDeclinedResourceEvents).toHaveBeenCalledTimes(2))
    fireEvent.click(await screen.findByRole('button', { name: 'Actualiser Google' }))
    expect(await screen.findByText('Ressource indisponible')).toBeInTheDocument()
    expect(getDeclinedResourceEvents).toHaveBeenCalledTimes(3)
  })

  it('approves a change notification and removes it from tasks', async () => {
    getEmployeeSummaries.mockResolvedValue([employee('CDI', 100)])
    getMonthlyTimeValidations.mockResolvedValue([{ employeeId: 'employee-CDI', schoolYear: 2025, month: 8, status: 'changes_pending', validatedAt: '2026-08-31T10:00:00Z', changeDetectedAt: '2026-09-06T09:00:00Z', changeCount: 1, approvedAt: null }])
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    const tasks = await screen.findByRole('region', { name: 'Tâches et alertes' })
    fireEvent.click(within(tasks).getByRole('button', { name: 'Approuver' }))
    await waitFor(() => expect(approveTimeMonthChange).toHaveBeenCalledWith('employee-CDI', 2025, 8))
    await waitFor(() => expect(tasks).toHaveTextContent('Aucune tâche urgente pour le moment'))
  })

  it('refreshes the overview and every task source after Google synchronization', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    await waitFor(() => expect(runIncrementalSync).toHaveBeenCalledWith('automatic'))
    await waitFor(() => expect(getUnassignedEvents).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser Google' }))
    await waitFor(() => expect(runIncrementalSync).toHaveBeenNthCalledWith(2, 'manual'))
    await waitFor(() => expect(getUnassignedEvents).toHaveBeenCalledTimes(3))
    expect(getCoefficientCalendars).toHaveBeenCalledTimes(3)
    expect(getMonthlyTimeValidations).toHaveBeenCalledTimes(3)
    expect(getEmployeeSummaries).toHaveBeenCalledTimes(3)
  })
})
