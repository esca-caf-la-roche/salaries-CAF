import { describe, expect, it } from 'vitest'
import { completedMonthsForSchoolYear, previousSchoolMonth, schoolMonthForDate } from './monthValidation'

describe('monthly validation periods', () => {
  it('maps January to the school year that started in September', () => {
    expect(schoolMonthForDate(new Date(2027, 0, 15))).toEqual({ schoolYear: 2026, month: 1 })
  })

  it('crosses the school-year boundary when September follows August', () => {
    expect(previousSchoolMonth(new Date(2026, 8, 6))).toEqual({ schoolYear: 2025, month: 8 })
  })

  it('returns only fully completed months in school-year order', () => {
    expect(completedMonthsForSchoolYear(2026, new Date(2027, 1, 10))).toEqual([9, 10, 11, 12, 1])
    expect(completedMonthsForSchoolYear(2027, new Date(2027, 8, 1))).toEqual([])
  })
})
