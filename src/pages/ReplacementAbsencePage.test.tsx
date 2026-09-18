import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReplacementAbsencePage } from './ReplacementAbsencePage'
import type { EmployeeSummary } from '../types'

const getEmployeeSummaries = vi.fn()

vi.mock('../services/api', () => ({
  getEmployeeSummaries: (...args: unknown[]) => getEmployeeSummaries(...args),
}))

const employee = (id: string, name: string, contractType: 'CDI' | 'INDEP' = 'CDI'): EmployeeSummary => ({
  id, name, calendarName: '', contractType, annualContractHours: contractType === 'INDEP' ? 0 : 800, paidMonths: 12, annualWorkedWeeks: 0,
  settings: { contractType, annualContractMinutes: contractType === 'INDEP' ? 0 : 48000, fullTimeAnnualMinutes: 94920, paidMonths: 12 }, payroll: [],
  monthlyHours: [
    { month: 9, rawHours: 0, weightedHours: 0, contractHours: 0, absenceHours: 2.5, replacementHours: 1.25, publicHolidayHours: 0, contractWithPrepHours: 0, contractWithoutPrepHours: 0, absenceWithPrepHours: 0, absenceWithoutPrepHours: 0, replacementWithPrepHours: 0, replacementWithoutPrepHours: 0, publicHolidayWithPrepHours: 0, publicHolidayWithoutPrepHours: 0, workedWeeks: 0, eventCount: 0 },
  ],
})

describe('ReplacementAbsencePage', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('groups non-zero hours by month, then by monitor and category', async () => {
    const onlyReplacement = employee('employee-2', 'Morgan Durand')
    onlyReplacement.monthlyHours = [{ ...onlyReplacement.monthlyHours[0], replacementHours: 3, absenceHours: 0 }]
    const octoberAbsence = employee('employee-3', 'Noa Bernard')
    octoberAbsence.monthlyHours = [{ ...octoberAbsence.monthlyHours[0], month: 10, replacementHours: 0, absenceHours: 4 }]
    getEmployeeSummaries.mockResolvedValue([employee('employee-1', 'Camille Martin'), onlyReplacement, octoberAbsence, employee('independent-1', 'Alex Indep', 'INDEP')])
    render(<MemoryRouter><ReplacementAbsencePage /></MemoryRouter>)

    const september = await screen.findByRole('region', { name: 'Sep' })
    expect(within(september).getByText('Camille Martin')).toBeInTheDocument()
    expect(within(september).getByText('Morgan Durand')).toBeInTheDocument()
    const camilleRow = within(september).getByText('Camille Martin').closest('li')
    const morganRow = within(september).getByText('Morgan Durand').closest('li')
    expect(camilleRow).not.toBeNull()
    expect(morganRow).not.toBeNull()
    expect(within(camilleRow!).getByText(/^Absence/)).toHaveTextContent('2:30')
    expect(within(camilleRow!).getByText(/^Remplacement/)).toHaveTextContent('1:15')
    expect(within(morganRow!).getByText(/^Remplacement/)).toHaveTextContent('3:00')
    expect(within(september).queryByText('Alex Indep')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Oct' })).toHaveTextContent('Noa Bernard')
    expect(screen.queryByRole('region', { name: 'Nov' })).not.toBeInTheDocument()
  })

  it('shows a load error without leaving stale figures', async () => {
    getEmployeeSummaries.mockRejectedValue(new Error('offline'))
    render(<MemoryRouter><ReplacementAbsencePage /></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('Le récapitulatif des absences et remplacements n’a pas pu être chargé.')
    expect(screen.getByText('Aucune absence ni aucun remplacement pour cette saison.')).toBeInTheDocument()
  })

  it('clears the previous season when the next season cannot load', async () => {
    getEmployeeSummaries
      .mockResolvedValueOnce([employee('employee-1', 'Camille Martin')])
      .mockRejectedValueOnce(new Error('offline'))
    render(<MemoryRouter><ReplacementAbsencePage /></MemoryRouter>)

    await screen.findByRole('region', { name: 'Sep' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Saison' }), { target: { value: '2025' } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Le récapitulatif des absences et remplacements n’a pas pu être chargé.')
    expect(screen.getByText('Aucune absence ni aucun remplacement pour cette saison.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Sep' })).not.toBeInTheDocument())
  })
})
