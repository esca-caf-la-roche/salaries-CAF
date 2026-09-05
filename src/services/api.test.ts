import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEmployeeSummaries, getIndependentEvents } from './api'

const from = vi.hoisted(() => vi.fn())
const invoke = vi.hoisted(() => vi.fn())
vi.mock('../lib/supabase', () => ({ isDemoMode: false, supabase: { from, functions: { invoke } } }))

describe('getIndependentEvents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requests the selected school season through the protected endpoint', async () => {
    const events = [{ id: 'event-1', employeeId: 'independent-1', employeeName: 'Intervenant' }]
    invoke.mockResolvedValue({ data: { events }, error: null })
    expect(await getIndependentEvents(2026)).toEqual(events)
    expect(invoke).toHaveBeenCalledWith('google-calendar-sync', {
      body: { action: 'independentEvents', schoolYear: 2026 },
    })
  })

  it('reports a failure instead of presenting it as an empty calendar', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Accès refusé') })
    await expect(getIndependentEvents(2026)).rejects.toThrow('Accès refusé')
  })
})

describe('getEmployeeSummaries', () => {
  beforeEach(() => vi.clearAllMocks())

  it('includes independents without annual hours and ignores an obsolete seasonal contract type', async () => {
    const rows: Record<string, unknown[]> = {
      employees: [
        { id: 'indep', display_name: 'Intervenant', contract_type: 'INDEP', annual_contract_hours: null },
        { id: 'incomplete', display_name: 'CDI incomplet', contract_type: 'CDI', annual_contract_hours: null },
      ],
      employee_school_year_settings: [{ employee_id: 'indep', contract_type: 'CDI', annual_contract_minutes: 600 }],
    }
    from.mockImplementation((table: string) => {
      const query = {
        select: () => query, eq: () => query, order: () => query,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve),
      }
      return query
    })
    const result = await getEmployeeSummaries(2026)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'indep', contractType: 'INDEP', settings: { contractType: 'INDEP' } })
  })
})
