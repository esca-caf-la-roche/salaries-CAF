import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmployeeSummary } from '../types'
import { TimeTrackingPage } from './TimeTrackingPage'

const getEmployeeSummaries = vi.fn()
const getMonthlyEventHours = vi.fn()
const saveAnnualTracking = vi.fn()
const getGovernmentPublicHolidaysForSchoolSeason = vi.fn()

vi.mock('../services/api', () => ({
  getEmployeeSummaries: (...args: unknown[]) => getEmployeeSummaries(...args),
  getMonthlyEventHours: (...args: unknown[]) => getMonthlyEventHours(...args),
  saveAnnualTracking: (...args: unknown[]) => saveAnnualTracking(...args),
}))

vi.mock('../services/publicHolidays', () => ({
  getGovernmentPublicHolidaysForSchoolSeason: (...args: unknown[]) => getGovernmentPublicHolidaysForSchoolSeason(...args),
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
    weightedHours: 896 + 56 / 60,
    contractHours: 887 + 56 / 60,
    absenceHours: 2,
    replacementHours: 3,
    publicHolidayHours: 4,
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
    getGovernmentPublicHolidaysForSchoolSeason.mockResolvedValue([
      { name: 'Férié ouvré test', date: new Date('2026-09-07T00:00:00.000Z') },
      { name: 'Férié week-end test', date: new Date('2026-09-06T00:00:00.000Z') },
    ])
  })

  it('shows the event-level monthly ledger with weighted duration and category', async () => {
    render(<TimeTrackingPage />)

    expect(await screen.findByText('Stage')).toBeInTheDocument()
    expect(screen.getByText('2:30')).toBeInTheDocument()
    expect(screen.getByText('Heures du contrat')).toBeInTheDocument()
    expect(getMonthlyEventHours).toHaveBeenCalledWith('employee-1', expect.any(Number), 9)
  })

  it('shows and saves independent actual hours without preparation or annual contract', async () => {
    getEmployeeSummaries.mockResolvedValue([{
      ...structuredClone(employee), contractType: 'INDEP', annualContractHours: 0,
      settings: { ...employee.settings, contractType: 'INDEP', annualContractMinutes: 0 },
      payroll: [],
      monthlyHours: [{ ...employee.monthlyHours[0], rawHours: 2, weightedHours: 2,
        contractHours: 2, absenceHours: 0, replacementHours: 0, publicHolidayHours: 0 }],
    }])
    getMonthlyEventHours.mockResolvedValue([{
      id: 'indep-event', title: 'Intervention', calendarName: 'Calendrier non configuré',
      startsAt: '2026-09-03T07:00:00Z', endsAt: '2026-09-03T09:00:00Z',
      rawHours: 2, weightedHours: 2, coefficient: 1, hourCategory: 'contract', hasPreparation: false,
    }])
    render(<TimeTrackingPage />)
    await screen.findByText('Intervention')
    expect(screen.getByText('Total réel').closest('span')).toHaveTextContent('2:00')
    expect(screen.queryByRole('columnheader', { name: 'Coefficient' })).not.toBeInTheDocument()
    expect(screen.queryByText('Avec et sans préparation')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Synthèse annuelle' }))
    expect(screen.getByText('Total dû').closest('article')).toHaveTextContent('2:00')
    expect(screen.queryByLabelText('Heures annuelles du contrat')).not.toBeInTheDocument()
    expect(screen.queryByText('Reste à réaliser')).not.toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Heures réalisées' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la saison' }))
    await waitFor(() => expect(saveAnnualTracking).toHaveBeenCalledWith(
      'employee-1', expect.any(Number), expect.objectContaining({ contractType: 'INDEP', annualContractMinutes: 0 }), expect.any(Array),
    ))
  })

  it('shows every hour-type total in the monthly summary', async () => {
    render(<TimeTrackingPage />)

    await screen.findByText('Férié ouvré test')
    const totals = await screen.findByRole('region', { name: 'Totaux du mois' })
    expect(totals).toHaveTextContent('Contrat887:56')
    expect(totals).toHaveTextContent('Absences2:00')
    expect(totals).toHaveTextContent('Remplacements3:00')
    expect(totals).toHaveTextContent('Fériés4:06')
    expect(screen.getByText('Heures retenues').closest('article')).toHaveTextContent('893:02')
    expect(screen.getByText('Total pondéré').closest('span')).toHaveTextContent('897:02')
    expect(screen.getByText('Férié week-end test').closest('tr')).toHaveTextContent('dimanche')
    expect(screen.getByText('Férié week-end test').closest('tr')).toHaveTextContent('Non compté · week-end')
  })

  it('switches to the annual sheet, calculates the contract remainder and saves payslips', async () => {
    render(<TimeTrackingPage />)
    await screen.findByRole('option', { name: 'Jérôme Test · CDI' })
    await screen.findByText('Férié ouvré test')

    fireEvent.click(screen.getByRole('tab', { name: 'Synthèse annuelle' }))

    expect(screen.getByText('31:58')).toBeInTheDocument()
    expect(screen.getByText('Référence temps plein')).toBeInTheDocument()
    expect(screen.getByText('Règle appliquée pour CDI')).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Heures du contrat' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Heures d’absences' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Heures de remplacements' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Heures fériées' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Heures fériées' }).closest('tr')).toHaveTextContent('4:06')
    expect(screen.getByRole('rowheader', { name: 'Total du mois' }).closest('tr')).toHaveTextContent('893:02')
    expect(screen.getByRole('region', { name: 'Jours fériés de la saison' })).toHaveTextContent('lundi')
    expect(screen.getByRole('region', { name: 'Jours fériés de la saison' })).toHaveTextContent('dimanche')
    expect(screen.getByRole('region', { name: 'Comparaison entre les heures réelles et le contrat annuel' }))
      .toHaveTextContent('Heures réelles893:02<Contrat annuel925:00→Coefficient retenucontrat annuel / 1582 = 0,5847')
    expect(screen.queryByRole('rowheader', { name: /prépa/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la saison' }))

    await waitFor(() => expect(saveAnnualTracking).toHaveBeenCalledWith(
      'employee-1', expect.any(Number), expect.objectContaining({ annualContractMinutes: 925 * 60 }), expect.any(Array),
    ))
    expect(await screen.findByText('Suivi de la saison enregistré.')).toBeInTheDocument()
  })
})
