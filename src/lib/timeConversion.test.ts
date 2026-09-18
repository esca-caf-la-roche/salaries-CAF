import { describe, expect, it } from 'vitest'
import { decimalHoursToMinutes, hoursMinutesToDecimal, parseFrenchDecimal } from './timeConversion'

describe('time conversion helpers', () => {
  it('converts hours and minutes to hundredth hours', () => {
    expect(hoursMinutesToDecimal(7, 30)).toBe(7.5)
    expect(hoursMinutesToDecimal(7, 15)).toBe(7.25)
    expect(hoursMinutesToDecimal(1, 1)).toBe(1.02)
  })

  it('converts hundredth hours to the nearest minute', () => {
    expect(decimalHoursToMinutes(7.5)).toEqual({ hours: 7, minutes: 30 })
    expect(decimalHoursToMinutes(7.25)).toEqual({ hours: 7, minutes: 15 })
    expect(decimalHoursToMinutes(1.02)).toEqual({ hours: 1, minutes: 1 })
  })

  it('accepts French decimal input and rejects invalid values', () => {
    expect(parseFrenchDecimal('7,25')).toBe(7.25)
    expect(parseFrenchDecimal('7.25')).toBe(7.25)
    expect(parseFrenchDecimal('-1')).toBeNull()
    expect(parseFrenchDecimal('7 h')).toBeNull()
  })
})
