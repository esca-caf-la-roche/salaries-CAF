import { describe, expect, it } from 'vitest'
import {
  calculateAnnualSummary,
  calculateCdiPublicHolidayHours,
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
  it('uses contract + holidays + replacements - absences as CDI realized hours', () => {
    const result = calculateAnnualSummary(baseInput)

    expect(result).toEqual({
      contractualRealizedHours: 901 + 56 / 60,
      guaranteedBaseHours: 925,
      overtimeHours: 0,
      paidLeaveDueHours: 92.5,
      publicHolidayDueHours: 14,
      totalDueHours: 1017.5,
      payslipTotalHours: 1020,
      remainingToWorkHours: 23 + 4 / 60,
      payBalanceHours: -2.5,
    })
  })

  it('includes automatic holidays and replacements and subtracts absences for a CDI', () => {
    const result = calculateAnnualSummary({
      ...baseInput,
      annualContractHours: 100,
      calendarContractHours: 110,
      calendarAbsenceHours: 5,
      calendarReplacementHours: 3,
      calendarPublicHolidayHours: 7,
      payslipHours: 0,
    })

    expect(result.guaranteedBaseHours).toBe(115)
    expect(result.overtimeHours).toBe(15)
    expect(result.paidLeaveDueHours).toBe(11.5)
    expect(result.totalDueHours).toBe(126.5)
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

describe('calculateCdiPublicHolidayHours', () => {
  it('uses the annual contract coefficient while realized hours stay below the contract', () => {
    const result = calculateCdiPublicHolidayHours({
      annualContractHours: 925,
      fullTimeAnnualHours: 1582,
      realizedHoursExcludingHolidays: 800,
      weekdayHolidayCount: 9,
    })

    expect(result.basis).toBe('contract')
    expect(result.coefficient).toBeCloseTo(925 / 1582)
    expect(result.hoursPerHoliday).toBeCloseTo(7 * 925 / 1582)
    expect(result.realizedHours).toBeCloseTo(800 + 9 * 7 * 925 / 1582)
  })

  it('uses the self-consistent realized-hours coefficient once the contract is reached', () => {
    const result = calculateCdiPublicHolidayHours({
      annualContractHours: 100,
      fullTimeAnnualHours: 1582,
      realizedHoursExcludingHolidays: 200,
      weekdayHolidayCount: 10,
    })

    expect(result.basis).toBe('realized')
    expect(result.coefficient).toBeCloseTo(result.realizedHours / 1582)
    expect(result.totalHours).toBeCloseTo(result.hoursPerHoliday * 10)
    expect(result.realizedHours).toBeCloseTo(200 + result.totalHours)
  })
})

describe('hour formatting', () => {
  it('rounds and formats positive and negative totals to the nearest minute', () => {
    expect(roundHoursToMinute(1.999)).toBe(2)
    expect(formatHoursMinutes(25.45)).toBe('25:27')
    expect(formatHoursMinutes(-1.5)).toBe('-1:30')
  })
})
