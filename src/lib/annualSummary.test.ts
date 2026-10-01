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
  sickLeaveHours: 0,
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
  it('counts independent actual hours without annual guarantee, leave or supplements', () => {
    const result = calculateAnnualSummary({
      ...baseInput, contractType: 'INDEP', annualContractHours: 1000,
      calendarContractHours: 12.5, calendarAbsenceHours: 0,
      calendarReplacementHours: 0, calendarPublicHolidayHours: 0,
      payslipHours: 10, payslipPaidLeaveHours: 4,
    })
    expect(result).toMatchObject({
      contractualRealizedHours: 12.5, totalDueHours: 12.5, payslipTotalHours: 10,
      remainingToWorkHours: 0, payBalanceHours: 2.5,
      paidLeaveDueHours: 0, publicHolidayDueHours: 0, overtimeHours: 0,
    })
  })
  it('uses contract + holidays + replacements - absences as CDI realized hours', () => {
    const result = calculateAnnualSummary(baseInput)

    expect(result).toMatchObject({
      contractualRealizedHours: 901 + 56 / 60,
      guaranteedBaseHours: 939,
      paidLeaveBaseHours: 925,
      overtimeHours: 0,
      paidLeaveDueHours: 92.5,
      publicHolidayDueHours: 14,
      totalDueHours: 1031.5,
      payslipTotalHours: 1020,
    })
    expect(result.payBalanceHours).toBeCloseTo(11.5)
    expect(result.remainingToWorkHours).toBeCloseTo(37 + 4 / 60)
  })

  it.each(['CDI', 'CDII', 'CDD'] as const)('counts %s sick leave as worked time and as bulletin hours', (contractType) => {
    const result = calculateAnnualSummary({
      ...baseInput, contractType, annualContractHours: 1000, calendarContractHours: 750,
      calendarAbsenceHours: 0, calendarReplacementHours: 0, calendarPublicHolidayHours: 0,
      sickLeaveHours: 250, payslipHours: 750, payslipPaidLeaveHours: 0,
    })
    expect(result.contractualRealizedHours).toBe(1000)
    expect(result.workedHours).toBe(1000)
    expect(result.remainingToWorkHours).toBe(0)
    expect(result.payslipTotalHours).toBe(1000)
  })

  it('keeps hundredth-hour precision when computing the remaining annual work', () => {
    const result = calculateAnnualSummary({
      ...baseInput, contractType: 'CDII', annualContractHours: 1000, calendarContractHours: 749.99,
      calendarAbsenceHours: 0, calendarReplacementHours: 0, calendarPublicHolidayHours: 0,
      sickLeaveHours: 250, payslipHours: 0, payslipPaidLeaveHours: 0,
    })
    expect(result.contractualRealizedHours).toBe(999.99)
    expect(result.remainingToWorkHours).toBeCloseTo(0.01)
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

    expect(result.guaranteedBaseHours).toBe(120)
    expect(result.workedHours).toBe(113)
    expect(result.contractualRealizedHours).toBe(115)
    expect(result.adjustedContractHours).toBe(98)
    expect(result.paidLeaveBaseHours).toBe(113)
    expect(result.overtimeHours).toBe(15)
    expect(result.paidLeaveDueHours).toBe(11.3)
    expect(result.totalDueHours).toBe(131.3)
    expect(result.remainingToWorkHours).toBe(0)
  })

  it('keeps CDI worked time stable when absences change while adjusting the contractual balance', () => {
    const input = { ...baseInput, annualContractHours: 100, calendarContractHours: 75.125,
      calendarReplacementHours: 2, calendarAbsenceHours: 6.6, calendarPublicHolidayHours: 0 }
    const withAbsence = calculateAnnualSummary(input)
    const withoutAbsence = calculateAnnualSummary({ ...input, calendarAbsenceHours: 0 })
    expect(withAbsence.workedHours).toBeCloseTo(77.125)
    expect(withoutAbsence.workedHours).toBeCloseTo(withAbsence.workedHours)
    expect(withoutAbsence.remainingToWorkHours - withAbsence.remainingToWorkHours).toBeCloseTo(6.6)
  })

  it('adds CDI replacement hours to both adjusted target and work performed', () => {
    const result = calculateAnnualSummary({ ...baseInput, annualContractHours: 100,
      calendarContractHours: 60, calendarAbsenceHours: 10, calendarReplacementHours: 5,
      calendarPublicHolidayHours: 0, sickLeaveHours: 0 })
    expect(result.adjustedContractHours).toBe(95)
    expect(result.workedHours).toBe(65)
    expect(result.remainingToWorkHours).toBe(30)
  })

  it('guarantees adjusted CDI hours, adds holidays once and applies ten percent on the base only', () => {
    const result = calculateAnnualSummary({ ...baseInput, annualContractHours: 100,
      calendarContractHours: 60, calendarAbsenceHours: 10, calendarReplacementHours: 5,
      calendarPublicHolidayHours: 7, payslipHours: 90, payslipPaidLeaveHours: 3 })
    expect(result.guaranteedBaseHours).toBe(102)
    // The 10% is computed on the base alone (95), not on base + holidays (102).
    expect(result.paidLeaveBaseHours).toBe(95)
    expect(result.paidLeaveDueHours).toBeCloseTo(9.5)
    expect(result.totalDueHours).toBeCloseTo(111.5)
    expect(result.payslipTotalHours).toBe(93)
    expect(result.payBalanceHours).toBeCloseTo(18.5)
    // The UI's bulletin-leave selection uses the same guaranteed base plus the recorded leave.
    expect(result.guaranteedBaseHours + 3 - result.payslipTotalHours).toBe(12)
  })

  it('uses the same annual target and worked-hour rules for CDII when computing hours due', () => {
    const result = calculateAnnualSummary({ ...baseInput, contractType: 'CDII', annualContractHours: 100,
      calendarContractHours: 60, calendarAbsenceHours: 10, calendarReplacementHours: 5,
      calendarPublicHolidayHours: 0, sickLeaveHours: 0 })
    expect(result.adjustedContractHours).toBe(95)
    expect(result.workedHours).toBe(65)
    expect(result.remainingToWorkHours).toBe(30)
    expect(result.contractualRealizedHours).toBe(70)
    expect(result.totalDueHours).toBe(95)
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
      expect(result.guaranteedBaseHours).toBe(contractType === 'CDII' ? 229 : 220)
      expect(result.overtimeHours).toBe(5)
      expect(result.paidLeaveDueHours).toBe(0)
      expect(result.publicHolidayDueHours).toBe(0)
      expect(result.totalDueHours).toBe(229)
      expect(result.payslipTotalHours).toBe(232)
      expect(result.payBalanceHours).toBe(-3)
    },
  )

  it('reduces the CDII amount due when absences lower the adjusted target below the performed hours', () => {
    const result = calculateAnnualSummary({ ...baseInput, contractType: 'CDII', annualContractHours: 100,
      calendarContractHours: 90, calendarAbsenceHours: 30, calendarReplacementHours: 0,
      calendarPublicHolidayHours: 0, sickLeaveHours: 0, payslipHours: 0, payslipPaidLeaveHours: 0 })
    expect(result.adjustedContractHours).toBe(70)
    expect(result.workedHours).toBe(90)
    expect(result.totalDueHours).toBe(90)
  })

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
    expect(result.guaranteedBaseHours).toBe(210)
    expect(result.totalDueHours).toBe(210)
    expect(result.remainingToWorkHours).toBe(25)
    expect(result.payBalanceHours).toBe(-10)
  })

  it('rejects invalid hour totals and full-time references', () => {
    expect(() => calculateAnnualSummary({ ...baseInput, calendarAbsenceHours: -1 })).toThrow(RangeError)
    expect(() => calculateAnnualSummary({ ...baseInput, sickLeaveHours: -1 })).toThrow(RangeError)
    expect(() => calculateAnnualSummary({ ...baseInput, fullTimeAnnualHours: 0 })).toThrow(RangeError)
  })
})

describe('calculateCdiPublicHolidayHours', () => {
  it('uses the adjusted contract (HCAR) coefficient while worked hours stay below it', () => {
    const result = calculateCdiPublicHolidayHours({
      adjustedContractHours: 925,
      fullTimeAnnualHours: 1582,
      realizedHoursExcludingHolidays: 800,
      weekdayHolidayCount: 9,
    })

    expect(result.basis).toBe('contract')
    expect(result.coefficientBaseHours).toBe(925)
    expect(result.coefficient).toBeCloseTo(925 / 1582)
    expect(result.hoursPerHoliday).toBeCloseTo(7 * 925 / 1582)
    expect(result.totalHours).toBeCloseTo(9 * 7 * 925 / 1582)
  })

  it('uses the worked hours (HT) coefficient once they exceed the adjusted contract', () => {
    const result = calculateCdiPublicHolidayHours({
      adjustedContractHours: 100,
      fullTimeAnnualHours: 1582,
      realizedHoursExcludingHolidays: 200,
      weekdayHolidayCount: 10,
    })

    expect(result.basis).toBe('realized')
    expect(result.coefficientBaseHours).toBe(200)
    expect(result.coefficient).toBeCloseTo(200 / 1582)
    expect(result.totalHours).toBeCloseTo(10 * 7 * 200 / 1582)
  })

  it('falls back to the adjusted contract basis when worked hours equal it exactly', () => {
    const result = calculateCdiPublicHolidayHours({
      adjustedContractHours: 95,
      fullTimeAnnualHours: 1582,
      realizedHoursExcludingHolidays: 95,
      weekdayHolidayCount: 1,
    })

    expect(result.basis).toBe('contract')
    expect(result.coefficientBaseHours).toBe(95)
    expect(result.coefficient).toBeCloseTo(95 / 1582)
  })

  it('keeps the 10% leave base and the holiday coefficient on the same base', () => {
    const summary = calculateAnnualSummary({ ...baseInput, annualContractHours: 100,
      calendarContractHours: 60, calendarAbsenceHours: 10, calendarReplacementHours: 5,
      calendarPublicHolidayHours: 7, sickLeaveHours: 0 })
    const holidays = calculateCdiPublicHolidayHours({
      adjustedContractHours: summary.adjustedContractHours,
      fullTimeAnnualHours: 1582,
      realizedHoursExcludingHolidays: summary.workedHours,
      weekdayHolidayCount: 1,
    })

    expect(holidays.coefficientBaseHours).toBe(summary.paidLeaveBaseHours)
    expect(holidays.coefficient).toBeCloseTo(summary.paidLeaveBaseHours / 1582)
  })
})

describe('hour formatting', () => {
  it('rounds and formats positive and negative totals to the nearest minute', () => {
    expect(roundHoursToMinute(1.999)).toBe(2)
    expect(formatHoursMinutes(25.45)).toBe('25:27')
    expect(formatHoursMinutes(-1.5)).toBe('-1:30')
  })
})
