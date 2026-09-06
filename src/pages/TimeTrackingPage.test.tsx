import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmployeeSummary } from '../types'
import { TimeTrackingPage } from './TimeTrackingPage'

const getEmployeeSummaries = vi.fn()
const getMonthlyEventHours = vi.fn()
const saveAnnualTracking = vi.fn()
const runIncrementalSync = vi.fn()
const getGovernmentPublicHolidaysForSchoolSeason = vi.fn()

vi.mock('../services/api', () => ({
  getEmployeeSummaries: (...args: unknown[]) => getEmployeeSummaries(...args),
  getMonthlyEventHours: (...args: unknown[]) => getMonthlyEventHours(...args),
  saveAnnualTracking: (...args: unknown[]) => saveAnnualTracking(...args),
  runIncrementalSync: (...args: unknown[]) => runIncrementalSync(...args),
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
    runIncrementalSync.mockResolvedValue({ status: 'success', lastSyncedAt: '2026-09-06T08:00:00Z', message: '1 ressource synchronisée.' })
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
    expect(screen.queryByRole('region', { name: 'Calcul annuel des heures' })).not.toBeInTheDocument()
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

  it('refreshes the tracking data after a manual Google synchronization', async () => {
    render(<TimeTrackingPage />)
    await screen.findByRole('option', { name: 'Jérôme Test · CDI' })

    fireEvent.click(screen.getByRole('button', { name: 'Actualiser Google' }))

    await waitFor(() => expect(runIncrementalSync).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(getEmployeeSummaries).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('1 ressource synchronisée.', { exact: false })).toBeInTheDocument()
  })

  it('switches to the annual sheet, calculates the contract remainder and saves payslips', async () => {
    render(<TimeTrackingPage />)
    await screen.findByRole('option', { name: 'Jérôme Test · CDI' })
    await screen.findByText('Férié ouvré test')

    fireEvent.click(screen.getByRole('tab', { name: 'Synthèse annuelle' }))

    expect(screen.getByText('31:58')).toBeInTheDocument()
    expect(screen.getByText('Référence temps plein')).toBeInTheDocument()
    expect(screen.getByText('Règle appliquée pour CDI')).toBeInTheDocument()
    const annualCategories = screen.getByRole('region', { name: 'Calcul annuel des heures' })
    expect(screen.getAllByRole('region', { name: 'Calcul annuel des heures' })).toHaveLength(1)
    expect(annualCategories).toHaveTextContent('Heures contrat887:56')
    expect(annualCategories).toHaveTextContent('Absences2:00')
    expect(annualCategories).toHaveTextContent('Remplacements3:00')
    expect(annualCategories).toHaveTextContent('Fériés4:06')
    expect(annualCategories).toHaveTextContent('Coefficients inclus')
    expect(annualCategories).toHaveTextContent('887:56 contrat + 4:06 fériés + 3:00 remplacements − 2:00 absences = 893:02')
    expect(annualCategories).toHaveTextContent('925:00 contrat − 893:02 réalisées = 31:58 à réaliser')
    expect(annualCategories).toHaveTextContent('Les fériés sont calculés séparément avec le coefficient annuel')
    expect(annualCategories).toHaveTextContent('Valeurs affichées arrondies à la minute.')
    const remainingCard = screen.getByText('Reste à réaliser').closest('article')
    expect(remainingCard).toHaveClass('annual-scoreboard__progress--due')
    expect(remainingCard).toHaveTextContent('31:58')
    expect(screen.getByTitle('Heures pondérées par mois')).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Heures du contrat' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Heures d’absences' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Heures de remplacements' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Heures fériées' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Heures fériées' }).closest('tr')).toHaveTextContent('4:06')
    expect(screen.getByRole('rowheader', { name: 'Heures réalisées' }).closest('tr')).toHaveTextContent('893:02')
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

  it.each(['CDII', 'CDD'] as const)('shows a green zero remainder card and the hours completed above a %s contract', async (contractType) => {
    getEmployeeSummaries.mockResolvedValue([{
      ...structuredClone(employee),
      contractType,
      annualContractHours: 100,
      settings: { ...employee.settings, contractType, annualContractMinutes: 100 * 60 },
      monthlyHours: [{ ...employee.monthlyHours[0], contractHours: 110, absenceHours: 2, replacementHours: 3, publicHolidayHours: 5 }],
    }])
    render(<TimeTrackingPage />)
    await screen.findByRole('option', { name: `Jérôme Test · ${contractType}` })

    fireEvent.click(screen.getByRole('tab', { name: 'Synthèse annuelle' }))

    const remainingCard = screen.getByText('Reste à réaliser').closest('article')
    expect(remainingCard).toHaveClass('annual-scoreboard__progress--complete')
    expect(remainingCard).toHaveTextContent('0:00')
    expect(remainingCard).toHaveTextContent('17:00 en plus du contrat')
    const annualCalculation = screen.getByRole('region', { name: 'Calcul annuel des heures' })
    expect(annualCalculation).toHaveTextContent('110:00 contrat + 2:00 absences + 5:00 fériés = 117:00')
    expect(annualCalculation).toHaveTextContent('Les 3:00 de remplacements sont payées en plus et n’entrent pas dans le calcul du reste.')
    expect(annualCalculation).toHaveTextContent('Total dû = max(100:00 contrat, 117:00 réalisées) + 3:00 remplacements = 120:00.')
    expect(annualCalculation).toHaveTextContent('Calcul des heures en plus du contrat')
    expect(annualCalculation).toHaveTextContent('117:00 réalisées − 100:00 contrat = +17:00 en plus du contrat')
    expect(screen.getByRole('rowheader', { name: 'Heures réalisées' }).closest('tr')).toHaveTextContent('117:00')
    expect(screen.queryByText(`Règle appliquée pour ${contractType}`)).not.toBeInTheDocument()
  })

  it('shows a zero balance without a sign when the annual contract is reached exactly', async () => {
    getEmployeeSummaries.mockResolvedValue([{
      ...structuredClone(employee),
      contractType: 'CDII',
      annualContractHours: 117,
      settings: { ...employee.settings, contractType: 'CDII', annualContractMinutes: 117 * 60 },
      monthlyHours: [{ ...employee.monthlyHours[0], contractHours: 110, absenceHours: 2, replacementHours: 3, publicHolidayHours: 5 }],
    }])
    render(<TimeTrackingPage />)
    await screen.findByRole('option', { name: 'Jérôme Test · CDII' })

    fireEvent.click(screen.getByRole('tab', { name: 'Synthèse annuelle' }))

    const remainingCard = screen.getByText('Reste à réaliser').closest('article')
    expect(remainingCard).toHaveClass('annual-scoreboard__progress--complete')
    expect(remainingCard).toHaveTextContent('0:00')
    expect(remainingCard).toHaveTextContent('contrat atteint exactement')
    const annualCalculation = screen.getByRole('region', { name: 'Calcul annuel des heures' })
    expect(annualCalculation).toHaveTextContent('Contrat annuel atteint')
    expect(annualCalculation).toHaveTextContent('117:00 réalisées = 117:00 contrat · 0:00 à réaliser')
  })
})
