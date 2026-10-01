import { describe, expect, it } from 'vitest'
import { calculateRetainedHours, calculateWorkedHours } from './hourTotals'

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

describe('calculateWorkedHours', () => {
  it('includes CDI replacements without reducing worked hours for absences or adding holidays', () => {
    const hours = { contractHours: 72.125, absenceHours: 6.6, replacementHours: 3, publicHolidayHours: 2 }
    expect(calculateWorkedHours(hours)).toBeCloseTo(75.125)
    expect(calculateWorkedHours({ ...hours, absenceHours: 20 })).toBeCloseTo(75.125)
    expect(calculateRetainedHours(hours)).toBeCloseTo(70.525)
  })
})
