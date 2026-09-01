import { describe, expect, it } from 'vitest'
import { calculateRetainedHours } from './hourTotals'

describe('calculateRetainedHours', () => {
  it('subtracts absences and adds replacements and public holidays', () => {
    expect(calculateRetainedHours({
      contractHours: 48 + 8 / 60,
      absenceHours: 6 + 15 / 60,
      replacementHours: 0,
      publicHolidayHours: 0,
    })).toBeCloseTo(41 + 53 / 60)
  })

  it('keeps a negative balance when absences exceed the other retained hours', () => {
    expect(calculateRetainedHours({
      contractHours: 2,
      absenceHours: 3,
      replacementHours: 0,
      publicHolidayHours: 0,
    })).toBe(-1)
  })
})
