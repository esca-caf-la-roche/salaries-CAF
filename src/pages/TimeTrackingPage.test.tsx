import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmployeeSummary } from '../types'
import { TimeTrackingPage } from './TimeTrackingPage'

const getEmployeeSummaries = vi.fn()
const getMonthlyEventHours = vi.fn()
const saveAnnualTracking = vi.fn()

vi.mock('../services/api', () => ({
  getEmployeeSummaries: (...args: unknown[]) => getEmployeeSummaries(...args),
  getMonthlyEventHours: (...args: unknown[]) => getMonthlyEventHours(...args),
  saveAnnualTracking: (...args: unknown[]) => saveAnnualTracking(...args),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin', role: 'admin', displayName: 'Admin', email: 'admin@example.fr' } }),
}))

const employee: EmployeeSummary = {
  id: 'employee-1',
  name: 'Jérôme Test',
  calendarName: 'Jérôme',
  contractType: 'CDI',
  annualContractHours: 925,
  annualWorkedWeeks: 33,
  settings: { contractType: 'CDI', annualContractMinutes: 925 * 60, fullTimeAnnualMinutes: 1582 * 60, paidMonths: 12 },
  payroll: [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8].map((month) => ({ month, paidMinutes: 85 * 60, paidLeaveMinutes: 0 })),
  monthlyHours: [{
    month: 9,
    rawHours: 887 + 56 / 60,
    weightedHours: 887 + 56 / 60,
    contractHours: 887 + 56 / 60,
    absenceHours: 0,
    replacementHours: 0,
    publicHolidayHours: 0,
    contractWithPrepHours: 400,
    contractWithoutPrepHours: 487 + 56 / 60,
    absenceWithPrepHours: 0,
    absenceWithoutPrepHours: 0,
    replacementWithPrepHours: 0,
    replacementWithoutPrepHours: 0,
    publicHolidayWithPrepHours: 0,
    publicHolidayWithoutPrepHours: 0,
    workedWeeks: 4,
    eventCount: 12,
  }],
}

describe('TimeTrackingPage', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    getEmployeeSummaries.mockResolvedValue([structuredClone(employee)])
    getMonthlyEventHours.mockResolvedValue([{
      id: 'event-1', title: 'Stage', calendarName: 'Heures avec prépa', calendarColor: '#7986cb',
      startsAt: '2026-09-03T07:00:00Z', endsAt: '2026-09-03T09:00:00Z', rawHours: 2,
      weightedHours: 2.5, coefficient: 1.25, hourCategory: 'contract', hasPreparation: true,
    }])
    saveAnnualTracking.mockResolvedValue(undefined)
  })

  it('shows the event-level monthly ledger with weighted duration and category', async () => {
    render(<TimeTrackingPage />)

    expect(await screen.findByText('Stage')).toBeInTheDocument()
    expect(screen.getByText('2:30')).toBeInTheDocument()
    expect(screen.getByText('Heures du contrat')).toBeInTheDocument()
    expect(getMonthlyEventHours).toHaveBeenCalledWith('employee-1', expect.any(Number), 9)
  })

  it('switches to the annual sheet, calculates the contract remainder and saves payslips', async () => {
    render(<TimeTrackingPage />)
    await screen.findByRole('option', { name: 'Jérôme Test · CDI' })

    fireEvent.click(screen.getByRole('tab', { name: 'Synthèse annuelle' }))

    expect(screen.getByText('37:04')).toBeInTheDocument()
    expect(screen.getByText('Référence temps plein')).toBeInTheDocument()
    expect(screen.getByText('Règle appliquée pour CDI')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la saison' }))

    await waitFor(() => expect(saveAnnualTracking).toHaveBeenCalledWith(
      'employee-1', expect.any(Number), expect.objectContaining({ annualContractMinutes: 925 * 60 }), expect.any(Array),
    ))
    expect(await screen.findByText('Suivi de la saison enregistré.')).toBeInTheDocument()
  })
})
