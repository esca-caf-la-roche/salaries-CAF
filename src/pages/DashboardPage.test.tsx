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

function employee(contractType: ContractType, annualContractHours: number, hours: Partial<MonthlyHours> = {}): EmployeeSummary {
  return {
    id: `employee-${contractType}`, name: contractType === 'INDEP' ? 'Alex Indépendant' : `Salarié ${contractType}`,
    calendarName: 'Calendrier Test', contractType, annualContractHours, annualWorkedWeeks: 1,
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
    runIncrementalSync.mockResolvedValue({ status: 'success', lastSyncedAt: '2026-09-01T08:00:00Z' })
    approveTimeMonthChange.mockImplementation(async (employeeId: string, schoolYear: number, month: number) => ({ employeeId, schoolYear, month, status: 'validated', validatedAt: '2026-08-31T10:00:00Z', changeDetectedAt: null, changeCount: 1, approvedAt: '2026-09-06T10:00:00Z' }))
  })

  it('calculates actual hours with the existing contract-specific rules', () => {
    expect(buildWorkerRecap(employee('CDI', 100, { contractHours: 90, absenceHours: 10, replacementHours: 5, publicHolidayHours: 3 }), 2026).actualHours).toBe(88)
    expect(buildWorkerRecap(employee('CDII', 100, { contractHours: 90, absenceHours: 10, replacementHours: 5, publicHolidayHours: 3 }), 2026).actualHours).toBe(103)
    expect(buildWorkerRecap(employee('INDEP', 0, { contractHours: 90, absenceHours: 10, replacementHours: 5, publicHolidayHours: 3 }), 2026).actualHours).toBe(108)
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
    await waitFor(() => expect(getUnassignedEvents).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser Google' }))
    await waitFor(() => expect(runIncrementalSync).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(getUnassignedEvents).toHaveBeenCalledTimes(2))
    expect(getCoefficientCalendars).toHaveBeenCalledTimes(2)
    expect(getMonthlyTimeValidations).toHaveBeenCalledTimes(2)
    expect(getEmployeeSummaries).toHaveBeenCalledTimes(2)
  })
})
