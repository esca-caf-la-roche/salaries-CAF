import { describe, expect, it } from 'vitest'
import { formatPayrollHours, parsePayrollHours } from './payroll'

describe('payroll hour conversion', () => {
  it('accepts French and dot decimal hours with at most two decimals', () => {
    expect(parsePayrollHours('85,50')).toBe(8550)
    expect(parsePayrollHours('85.5')).toBe(8550)
    expect(parsePayrollHours('0')).toBe(0)
  })

  it('rejects negative, over-precise and incomplete values', () => {
    expect(parsePayrollHours('-1')).toBeNull()
    expect(parsePayrollHours('1,234')).toBeNull()
    expect(parsePayrollHours('')).toBeNull()
  })

  it('formats stored hundredths for editing', () => {
    expect(formatPayrollHours(8550)).toBe('85,50')
  })
})
