import { describe, expect, it } from 'vitest'
import { formatHours, monthLabel, schoolMonths, schoolYearForDate } from './format'

describe('format helpers', () => {
  it('formats French month labels', () => expect(monthLabel(2)).toBe('Fév'))
  it('formats weighted hours', () => expect(formatHours(12.5)).toContain('12,5'))
  it('orders a school year from September through August', () => expect(schoolMonths).toEqual([9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8]))
  it('assigns August and September to consecutive school years', () => {
    expect(schoolYearForDate(new Date(2026, 7, 31))).toBe(2025)
    expect(schoolYearForDate(new Date(2026, 8, 1))).toBe(2026)
  })
})
