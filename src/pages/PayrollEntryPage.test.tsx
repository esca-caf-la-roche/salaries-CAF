import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PayrollEntryPage } from './PayrollEntryPage'

const getPayrollEntryPage = vi.fn()
const savePayrollMonth = vi.fn()
vi.mock('../services/api', () => ({
  getPayrollEntryPage: (...args: unknown[]) => getPayrollEntryPage(...args),
  savePayrollMonth: (...args: unknown[]) => savePayrollMonth(...args),
}))

describe('PayrollEntryPage', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.clearAllMocks()
    getPayrollEntryPage.mockResolvedValue({
      workers: [
        { employeeId: 'be-1', employeeName: 'Alice Martin', paidHundredthHours: 8050 },
        { employeeId: 'be-2', employeeName: 'Benoît Durand', paidHundredthHours: 7200 },
      ],
      recordedMonths: [{ schoolYear: 2026, month: 9, employeeCount: 2 }],
    })
    savePayrollMonth.mockResolvedValue(undefined)
  })

  it('shows all BE for one month and saves their decimal hours together', async () => {
    render(<PayrollEntryPage />)
    const alice = await screen.findByRole('textbox', { name: 'Heures payées pour Alice Martin' })
    expect(alice).toHaveValue('80,50')
    expect(screen.getByRole('textbox', { name: 'Heures payées pour Benoît Durand' })).toHaveValue('72,00')

    fireEvent.change(alice, { target: { value: '81,25' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer le mois/ }))

    await waitFor(() => expect(savePayrollMonth).toHaveBeenCalled())
    expect(savePayrollMonth.mock.calls[0][2]).toEqual(expect.arrayContaining([
      expect.objectContaining({ employeeId: 'be-1', paidHundredthHours: 8125 }),
      expect.objectContaining({ employeeId: 'be-2', paidHundredthHours: 7200 }),
    ]))
    expect(await screen.findByText(/Bulletins de .* enregistrés/)).toBeInTheDocument()
  })

  it('blocks invalid values before they reach the database', async () => {
    render(<PayrollEntryPage />)
    const alice = await screen.findByRole('textbox', { name: 'Heures payées pour Alice Martin' })
    fireEvent.change(alice, { target: { value: '-1' } })
    expect(screen.getByRole('button', { name: /Enregistrer le mois/ })).toBeDisabled()
    expect(screen.getByText(/deux décimales maximum/)).toBeInTheDocument()
  })

  it('reloads a recorded month when it is selected', async () => {
    render(<PayrollEntryPage />)
    const recorded = await screen.findByRole('button', { name: /Sep 2026/ })
    fireEvent.click(recorded)
    await waitFor(() => expect(getPayrollEntryPage).toHaveBeenCalledWith(2026, 9))
  })

  it('never saves stale workers when a new period fails to load', async () => {
    render(<PayrollEntryPage />)
    await screen.findByRole('textbox', { name: 'Heures payées pour Alice Martin' })
    getPayrollEntryPage.mockRejectedValueOnce(new Error('network'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Mois' }), { target: { value: '10' } })

    expect(await screen.findByRole('alert')).toHaveTextContent('n’ont pas pu être chargés')
    expect(screen.queryByRole('textbox', { name: 'Heures payées pour Alice Martin' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Enregistrer le mois/ })).toBeDisabled()
    expect(savePayrollMonth).not.toHaveBeenCalled()
  })
})
