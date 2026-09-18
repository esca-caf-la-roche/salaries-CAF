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

  it('summarizes absence and replacement hours for every month and employee', async () => {
    getEmployeeSummaries.mockResolvedValue([employee('employee-1', 'Camille Martin'), employee('independent-1', 'Alex Indep', 'INDEP')])
    render(<MemoryRouter><ReplacementAbsencePage /></MemoryRouter>)

    const table = await screen.findByRole('table')
    expect(within(table).getByRole('rowheader', { name: 'Camille Martin · Absences' })).toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { name: 'Camille Martin · Remplacements' })).toBeInTheDocument()
    expect(within(table).queryByText('Alex Indep')).not.toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { name: 'Camille Martin · Absences' }).parentElement).toHaveTextContent('2:30')
    expect(within(table).getByRole('rowheader', { name: 'Camille Martin · Remplacements' }).parentElement).toHaveTextContent('1:15')
    expect(screen.getByRole('region', { name: 'Totaux de la saison' })).toHaveTextContent('2:30')
    expect(screen.getByRole('region', { name: 'Totaux de la saison' })).toHaveTextContent('1:15')
  })

  it('shows a load error without leaving stale figures', async () => {
    getEmployeeSummaries.mockRejectedValue(new Error('offline'))
    render(<MemoryRouter><ReplacementAbsencePage /></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('Le récapitulatif des absences et remplacements n’a pas pu être chargé.')
    expect(screen.getByText('Aucun salarié actif pour cette saison.')).toBeInTheDocument()
  })

  it('clears the previous season when the next season cannot load', async () => {
    getEmployeeSummaries
      .mockResolvedValueOnce([employee('employee-1', 'Camille Martin')])
      .mockRejectedValueOnce(new Error('offline'))
    render(<MemoryRouter><ReplacementAbsencePage /></MemoryRouter>)

    await screen.findByRole('table')
    fireEvent.change(screen.getByRole('combobox', { name: 'Saison' }), { target: { value: '2025' } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Le récapitulatif des absences et remplacements n’a pas pu être chargé.')
    expect(screen.getByText('Aucun salarié actif pour cette saison.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument())
    expect(screen.getByRole('region', { name: 'Totaux de la saison' })).toHaveTextContent('0:00')
  })
})
