import { describe, expect, it } from 'vitest'
import {
  calculateAnnualSummary,
  countWeekdayFrenchPublicHolidaysForSchoolSeason,
  formatHoursMinutes,
  getEasterSunday,
  getFrenchMetropolitanPublicHolidays,
  roundHoursToMinute,
  type AnnualSummaryInput,
} from './annualSummary'

const baseInput: AnnualSummaryInput = {
  contractType: 'CDI',
  annualContractHours: 925,
  calendarContractHours: 887 + 56 / 60,
  calendarAbsenceHours: 0,
  calendarReplacementHours: 0,
  calendarPublicHolidayHours: 14,
  payslipHours: 1020,
  payslipPaidLeaveHours: 0,
  schoolSeason: { startYear: 2024 },
}

describe('French metropolitan public holidays', () => {
  it('calculates Easter and all 11 legal holidays', () => {
    expect(getEasterSunday(2025).toISOString().slice(0, 10)).toBe('2025-04-20')

    const holidays = getFrenchMetropolitanPublicHolidays(2025)
    expect(holidays).toHaveLength(11)
    expect(holidays.find(({ name }) => name === 'Ascension')?.date.toISOString().slice(0, 10))
      .toBe('2025-05-29')
    expect(holidays.find(({ name }) => name === 'Lundi de Pentecôte')?.date.toISOString().slice(0, 10))
      .toBe('2025-06-09')
  })

  it('counts only Monday-to-Friday holidays inside the September-to-August season', () => {
    expect(countWeekdayFrenchPublicHolidaysForSchoolSeason({ startYear: 2024 })).toBe(11)
    expect(countWeekdayFrenchPublicHolidaysForSchoolSeason({ startYear: 2025 })).toBe(9)
  })
})

describe('calculateAnnualSummary', () => {
  it('guarantees the CDI contract and adds paid leave plus the calculated holiday allowance', () => {
    const result = calculateAnnualSummary(baseInput)

    expect(result).toEqual({
      contractualRealizedHours: 887 + 56 / 60,
      guaranteedBaseHours: 925,
      overtimeHours: 0,
      paidLeaveDueHours: 92.5,
      publicHolidayDueHours: 45 + 1 / 60,
      totalDueHours: 1062 + 31 / 60,
      payslipTotalHours: 1020,
      remainingToWorkHours: 37 + 4 / 60,
      payBalanceHours: 42 + 31 / 60,
    })
  })

  it('ignores CDI calendar holiday events and always adds replacements on top', () => {
    const withoutCalendarHoliday = calculateAnnualSummary({
      ...baseInput,
      calendarReplacementHours: 12.5,
      calendarPublicHolidayHours: 0,
    })
    const withCalendarHoliday = calculateAnnualSummary({
      ...baseInput,
      calendarReplacementHours: 12.5,
      calendarPublicHolidayHours: 70,
    })

    expect(withCalendarHoliday).toEqual(withoutCalendarHoliday)
    expect(withCalendarHoliday.totalDueHours).toBe(1075 + 1 / 60)
  })

  it('uses hours above the CDI contract as the guaranteed base and exposes them as overtime', () => {
    const result = calculateAnnualSummary({
      ...baseInput,
      annualContractHours: 100,
      calendarContractHours: 110,
      calendarAbsenceHours: 5,
      calendarReplacementHours: 3,
      payslipHours: 0,
    })

    expect(result.guaranteedBaseHours).toBe(115)
    expect(result.overtimeHours).toBe(15)
    expect(result.paidLeaveDueHours).toBe(11.5)
    expect(result.totalDueHours).toBeGreaterThan(129.5)
    expect(result.remainingToWorkHours).toBe(0)
  })

  it.each(['CDII', 'CDD'] as const)(
    'treats %s calendar holidays as realized hours without adding CDI allowances',
    (contractType) => {
      const result = calculateAnnualSummary({
        ...baseInput,
        contractType,
        annualContractHours: 220,
        calendarContractHours: 210,
        calendarAbsenceHours: 0,
        calendarPublicHolidayHours: 15,
        calendarReplacementHours: 4,
        payslipHours: 230,
        payslipPaidLeaveHours: 2,
      })

      expect(result.contractualRealizedHours).toBe(225)
      expect(result.guaranteedBaseHours).toBe(220)
      expect(result.overtimeHours).toBe(5)
      expect(result.paidLeaveDueHours).toBe(0)
      expect(result.publicHolidayDueHours).toBe(0)
      expect(result.totalDueHours).toBe(229)
      expect(result.payslipTotalHours).toBe(232)
      expect(result.payBalanceHours).toBe(-3)
    },
  )

  it('guarantees the annual contract when realized hours are lower', () => {
    const result = calculateAnnualSummary({
      ...baseInput,
      contractType: 'CDII',
      annualContractHours: 220,
      calendarContractHours: 180,
      calendarAbsenceHours: 10,
      calendarPublicHolidayHours: 5,
      payslipHours: 220,
    })

    expect(result.contractualRealizedHours).toBe(195)
    expect(result.guaranteedBaseHours).toBe(220)
    expect(result.totalDueHours).toBe(220)
    expect(result.remainingToWorkHours).toBe(25)
    expect(result.payBalanceHours).toBe(0)
  })

  it('rejects invalid hour totals and full-time references', () => {
    expect(() => calculateAnnualSummary({ ...baseInput, calendarAbsenceHours: -1 })).toThrow(RangeError)
    expect(() => calculateAnnualSummary({ ...baseInput, fullTimeAnnualHours: 0 })).toThrow(RangeError)
  })
})

describe('hour formatting', () => {
  it('rounds and formats positive and negative totals to the nearest minute', () => {
    expect(roundHoursToMinute(1.999)).toBe(2)
    expect(formatHoursMinutes(25.45)).toBe('25:27')
    expect(formatHoursMinutes(-1.5)).toBe('-1:30')
  })
})
