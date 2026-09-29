import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReplacementAbsencePage } from './ReplacementAbsencePage'
import type { EmployeeSummary, MonthlyEventHour } from '../types'

const getEmployeeSummaries = vi.fn()
const getMonthlyEventHours = vi.fn()
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

vi.mock('../services/api', () => ({
  getEmployeeSummaries: (...args: unknown[]) => getEmployeeSummaries(...args),
  getMonthlyEventHours: (...args: unknown[]) => getMonthlyEventHours(...args),
}))

const employee = (id: string, name: string, contractType: 'CDI' | 'INDEP' = 'CDI'): EmployeeSummary => ({
  id, name, calendarName: '', contractType, annualContractHours: contractType === 'INDEP' ? 0 : 800, paidMonths: 12, annualWorkedWeeks: 0,
  settings: { contractType, annualContractMinutes: contractType === 'INDEP' ? 0 : 48000, fullTimeAnnualMinutes: 94920, paidMonths: 12 }, payroll: [],
  monthlyHours: [
    { month: 9, rawHours: 0, weightedHours: 0, contractHours: 0, absenceHours: 2.5, replacementHours: 1.25, publicHolidayHours: 0, contractWithPrepHours: 0, contractWithoutPrepHours: 0, absenceWithPrepHours: 0, absenceWithoutPrepHours: 0, replacementWithPrepHours: 0, replacementWithoutPrepHours: 0, publicHolidayWithPrepHours: 0, publicHolidayWithoutPrepHours: 0, workedWeeks: 0, eventCount: 0 },
  ],
})

const absenceSlot: MonthlyEventHour = {
  id: 'event-absence', title: 'Stage arkose', calendarName: 'Avec prépa', calendarColor: '#7986cb',
  startsAt: '2026-09-03T07:00:00Z', endsAt: '2026-09-03T09:00:00Z', rawHours: 2, weightedHours: 2.5,
  coefficient: 1.25, hourCategory: 'absence', hasPreparation: true,
}

const replacementSlot: MonthlyEventHour = {
  id: 'event-replacement', title: 'Cours bébés', calendarName: 'Remplacements', calendarColor: '#e26d3f',
  startsAt: '2026-09-05T13:00:00Z', endsAt: '2026-09-05T14:15:00Z', rawHours: 1.25, weightedHours: 1.25,
  coefficient: 1, hourCategory: 'replacement', hasPreparation: false,
}

describe('ReplacementAbsencePage', () => {
  afterEach(() => {
    cleanup()
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else Reflect.deleteProperty(navigator, 'clipboard')
  })

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
    expect(getMonthlyEventHours).not.toHaveBeenCalled()
  })

  it('shows the slots of a monitor with absences and replacements in separate groups', async () => {
    getEmployeeSummaries.mockResolvedValue([employee('employee-1', 'Camille Martin')])
    getMonthlyEventHours.mockResolvedValue([absenceSlot, replacementSlot])
    render(<MemoryRouter><ReplacementAbsencePage /></MemoryRouter>)

    const september = await screen.findByRole('region', { name: 'Sep' })
    fireEvent.click(within(september).getByRole('button', { name: /Camille Martin/ }))

    await waitFor(() => expect(getMonthlyEventHours).toHaveBeenCalledWith('employee-1', expect.any(Number), 9))
    const absenceGroup = await screen.findByRole('region', { name: 'Absences de Camille Martin' })
    expect(within(absenceGroup).getByText('Stage arkose')).toBeInTheDocument()
    expect(within(absenceGroup).getByText('2:30 (2:00 × 1,25)')).toBeInTheDocument()
    expect(within(absenceGroup).queryByText('Cours bébés')).not.toBeInTheDocument()

    const replacementGroup = screen.getByRole('region', { name: 'Remplacements de Camille Martin' })
    expect(within(replacementGroup).getByText('Cours bébés')).toBeInTheDocument()
    expect(within(replacementGroup).getByText('Total 1:15')).toBeInTheDocument()
    expect(within(replacementGroup).getByText('1:15')).toBeInTheDocument()
    expect(within(replacementGroup).queryByText('Stage arkose')).not.toBeInTheDocument()
  })

  it('keeps the slot detail collapsed until the monitor is opened', async () => {
    getEmployeeSummaries.mockResolvedValue([employee('employee-1', 'Camille Martin')])
    getMonthlyEventHours.mockResolvedValue([absenceSlot, replacementSlot])
    render(<MemoryRouter><ReplacementAbsencePage /></MemoryRouter>)

    const september = await screen.findByRole('region', { name: 'Sep' })
    const monitorButton = within(september).getByRole('button', { name: /Camille Martin/ })
    expect(monitorButton).toHaveAttribute('aria-expanded', 'false')
    expect(getMonthlyEventHours).not.toHaveBeenCalled()

    fireEvent.click(monitorButton)
    expect(await screen.findByRole('region', { name: 'Absences de Camille Martin' })).toBeVisible()
    expect(monitorButton).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(monitorButton)
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Absences de Camille Martin' })).not.toBeInTheDocument())
    expect(monitorButton).toHaveAttribute('aria-expanded', 'false')
    expect(getMonthlyEventHours).toHaveBeenCalledTimes(1)
  })

  it('copies the whole month, absences and replacements separated, for the payroll company', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const onlyReplacement = employee('employee-2', 'Morgan Durand')
    onlyReplacement.monthlyHours = [{ ...onlyReplacement.monthlyHours[0], replacementHours: 3, absenceHours: 0 }]
    getEmployeeSummaries.mockResolvedValue([employee('employee-1', 'Camille Martin'), onlyReplacement])
    getMonthlyEventHours.mockImplementation((employeeId: string) => Promise.resolve(
      employeeId === 'employee-1' ? [absenceSlot, replacementSlot] : [{ ...replacementSlot, id: 'event-morgan', title: 'Accompagnement', weightedHours: 3, rawHours: 3 }],
    ))
    render(<MemoryRouter><ReplacementAbsencePage /></MemoryRouter>)

    const september = await screen.findByRole('region', { name: 'Sep' })
    fireEvent.click(within(september).getByRole('button', { name: 'Copier le mois' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const report = String(writeText.mock.calls[0][0])
    expect(report).toContain('Absences et remplacements — septembre 2026')
    expect(report).toContain('Saison 2026–2027')
    expect(report).toContain('Camille Martin\nAbsences — 2,50 h')
    expect(report).toMatch(/03\/09 09:00–11:00 · Stage arkose · 2,50 h \(× 1,25\)/)
    expect(report).toContain('Remplacements — 1,25 h')
    expect(report).toContain('Cours bébés · 1,25 h')
    expect(report).toContain('Morgan Durand\nAbsences — 0,00 h')
    expect(report).toContain('Accompagnement · 3,00 h')
    expect(report).toContain('Total septembre 2026 — Absences : 2,50 h · Remplacements : 4,25 h')
    expect(report.indexOf('Stage arkose')).toBeLessThan(report.indexOf('Cours bébés'))
    expect(getMonthlyEventHours).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('Mois copié')).toBeInTheDocument()
  })

  it('refuses to copy when the slots do not add up to the monthly totals', async () => {
    const writeText = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    getEmployeeSummaries.mockResolvedValue([employee('employee-1', 'Camille Martin')])
    getMonthlyEventHours.mockResolvedValue([{ ...absenceSlot, id: 'event-short', weightedHours: 1, rawHours: 0.8 }])
    render(<MemoryRouter><ReplacementAbsencePage /></MemoryRouter>)

    const september = await screen.findByRole('region', { name: 'Sep' })
    fireEvent.click(within(september).getByRole('button', { name: 'Copier le mois' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Copie impossible : le détail ne correspond pas aux totaux du mois.')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('copies when the only difference with the monthly totals is the SQL rounding', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const roundingEmployee = employee('employee-1', 'Camille Martin')
    roundingEmployee.monthlyHours = [{ ...roundingEmployee.monthlyHours[0], absenceHours: 1.88, replacementHours: 0 }]
    getEmployeeSummaries.mockResolvedValue([roundingEmployee])
    getMonthlyEventHours.mockResolvedValue([{ ...absenceSlot, id: 'event-rounding', weightedHours: 1.875, rawHours: 1.5 }])
    render(<MemoryRouter><ReplacementAbsencePage /></MemoryRouter>)

    const september = await screen.findByRole('region', { name: 'Sep' })
    fireEvent.click(within(september).getByRole('button', { name: 'Copier le mois' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const report = String(writeText.mock.calls[0][0])
    expect(report).toContain('Absences — 1,88 h')
    expect(report).toContain('Total septembre 2026 — Absences : 1,88 h · Remplacements : 0,00 h')
    expect(await screen.findByText('Mois copié')).toBeInTheDocument()
  })

  it('offers a retry when a monitor detail fails to load', async () => {
    getEmployeeSummaries.mockResolvedValue([employee('employee-1', 'Camille Martin')])
    getMonthlyEventHours
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([absenceSlot, replacementSlot])
    render(<MemoryRouter><ReplacementAbsencePage /></MemoryRouter>)

    const september = await screen.findByRole('region', { name: 'Sep' })
    fireEvent.click(within(september).getByRole('button', { name: /Camille Martin/ }))

    expect(await screen.findByText('Le détail des créneaux n’a pas pu être chargé.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Réessayer/ }))

    expect(await screen.findByRole('region', { name: 'Absences de Camille Martin' })).toBeInTheDocument()
    expect(getMonthlyEventHours).toHaveBeenCalledTimes(2)
  })

  it('never writes the clipboard when the season changes during a copy', async () => {
    const writeText = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    let resolveDetail: ((events: MonthlyEventHour[]) => void) | undefined
    getEmployeeSummaries.mockResolvedValue([employee('employee-1', 'Camille Martin')])
    getMonthlyEventHours.mockReturnValue(new Promise<MonthlyEventHour[]>((resolve) => { resolveDetail = resolve }))
    render(<MemoryRouter><ReplacementAbsencePage /></MemoryRouter>)

    const september = await screen.findByRole('region', { name: 'Sep' })
    fireEvent.click(within(september).getByRole('button', { name: 'Copier le mois' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Saison' }), { target: { value: '2025' } })
    await act(async () => { resolveDetail?.([absenceSlot, replacementSlot]) })

    expect(writeText).not.toHaveBeenCalled()
    expect(screen.queryByText('Mois copié')).not.toBeInTheDocument()
  })

  it('reports an unavailable clipboard as such', async () => {
    Reflect.deleteProperty(navigator, 'clipboard')
    getEmployeeSummaries.mockResolvedValue([employee('employee-1', 'Camille Martin')])
    getMonthlyEventHours.mockResolvedValue([absenceSlot, replacementSlot])
    render(<MemoryRouter><ReplacementAbsencePage /></MemoryRouter>)

    const september = await screen.findByRole('region', { name: 'Sep' })
    fireEvent.click(within(september).getByRole('button', { name: 'Copier le mois' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Copie impossible : presse-papier indisponible.')
  })

  it('reports a copy failure when the slot detail cannot be loaded', async () => {
    const writeText = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    getEmployeeSummaries.mockResolvedValue([employee('employee-1', 'Camille Martin')])
    getMonthlyEventHours.mockRejectedValue(new Error('offline'))
    render(<MemoryRouter><ReplacementAbsencePage /></MemoryRouter>)

    const september = await screen.findByRole('region', { name: 'Sep' })
    fireEvent.click(within(september).getByRole('button', { name: 'Copier le mois' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Copie impossible : détail non chargé.')
    expect(writeText).not.toHaveBeenCalled()
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
