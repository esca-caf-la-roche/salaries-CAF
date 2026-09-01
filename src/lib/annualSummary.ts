import type { ContractType } from '../types'

export interface SchoolSeason {
  /** Year in which the school season starts (September). */
  startYear: number
}

export interface AnnualSummaryInput {
  contractType: ContractType
  annualContractHours: number
  calendarContractHours: number
  calendarAbsenceHours: number
  calendarReplacementHours: number
  calendarPublicHolidayHours: number
  payslipHours: number
  payslipPaidLeaveHours: number
  schoolSeason: SchoolSeason
  fullTimeAnnualHours?: number
}

export interface AnnualSummary {
  contractualRealizedHours: number
  guaranteedBaseHours: number
  overtimeHours: number
  paidLeaveDueHours: number
  publicHolidayDueHours: number
  totalDueHours: number
  payslipTotalHours: number
  remainingToWorkHours: number
  /** Positive means hours remain to be paid; negative means hours were paid in advance. */
  payBalanceHours: number
}

export interface FrenchPublicHoliday {
  name: string
  date: Date
}

const DEFAULT_FULL_TIME_ANNUAL_HOURS = 1582
const MINUTES_PER_HOUR = 60

export function roundHoursToMinute(hours: number): number {
  return Math.round((hours + Number.EPSILON) * MINUTES_PER_HOUR) / MINUTES_PER_HOUR
}

export function formatHoursMinutes(hours: number): string {
  const roundedMinutes = Math.round(Math.abs(hours) * MINUTES_PER_HOUR)
  const sign = hours < 0 ? '-' : ''
  const wholeHours = Math.floor(roundedMinutes / MINUTES_PER_HOUR)
  const minutes = roundedMinutes % MINUTES_PER_HOUR

  return `${sign}${wholeHours}:${minutes.toString().padStart(2, '0')}`
}

/** Returns Easter Sunday using the Gregorian calendar (Meeus/Jones/Butcher algorithm). */
export function getEasterSunday(year: number): Date {
  assertYear(year, 'year')

  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1

  return utcDate(year, month, day)
}

export function getFrenchMetropolitanPublicHolidays(year: number): FrenchPublicHoliday[] {
  assertYear(year, 'year')

  const easterSunday = getEasterSunday(year)

  return [
    { name: "Jour de l'an", date: utcDate(year, 1, 1) },
    { name: 'Lundi de Pâques', date: addUtcDays(easterSunday, 1) },
    { name: 'Fête du Travail', date: utcDate(year, 5, 1) },
    { name: 'Victoire 1945', date: utcDate(year, 5, 8) },
    { name: 'Ascension', date: addUtcDays(easterSunday, 39) },
    { name: 'Lundi de Pentecôte', date: addUtcDays(easterSunday, 50) },
    { name: 'Fête nationale', date: utcDate(year, 7, 14) },
    { name: 'Assomption', date: utcDate(year, 8, 15) },
    { name: 'Toussaint', date: utcDate(year, 11, 1) },
    { name: 'Armistice 1918', date: utcDate(year, 11, 11) },
    { name: 'Noël', date: utcDate(year, 12, 25) },
  ]
}

export function countWeekdayFrenchPublicHolidaysForSchoolSeason(season: SchoolSeason): number {
  assertYear(season.startYear, 'schoolSeason.startYear')

  const seasonStart = utcDate(season.startYear, 9, 1).getTime()
  const seasonEnd = utcDate(season.startYear + 1, 8, 31).getTime()

  return [season.startYear, season.startYear + 1]
    .flatMap(getFrenchMetropolitanPublicHolidays)
    .filter(({ date }) => {
      const timestamp = date.getTime()
      const day = date.getUTCDay()
      return timestamp >= seasonStart && timestamp <= seasonEnd && day >= 1 && day <= 5
    }).length
}

export function calculateAnnualSummary(input: AnnualSummaryInput): AnnualSummary {
  validateInput(input)

  const fullTimeAnnualHours = input.fullTimeAnnualHours ?? DEFAULT_FULL_TIME_ANNUAL_HOURS
  const ordinaryRealizedHours = input.calendarContractHours + input.calendarAbsenceHours
  const calendarHolidayHours = input.contractType === 'CDI' ? 0 : input.calendarPublicHolidayHours
  const contractualRealizedHours = ordinaryRealizedHours + calendarHolidayHours
  const guaranteedBaseHours = Math.max(input.annualContractHours, ordinaryRealizedHours)
  const overtimeHours = Math.max(0, contractualRealizedHours - input.annualContractHours)
  const paidLeaveDueHours = input.contractType === 'CDI' ? guaranteedBaseHours * 0.1 : 0
  const weekdayPublicHolidayCount = input.contractType === 'CDI'
    ? countWeekdayFrenchPublicHolidaysForSchoolSeason(input.schoolSeason)
    : 0
  const publicHolidayDueHours = input.contractType === 'CDI'
    ? (input.annualContractHours / fullTimeAnnualHours) * 7 * weekdayPublicHolidayCount
    : 0
  const dueContractualBaseHours = Math.max(guaranteedBaseHours, contractualRealizedHours)
  const totalDueHours = dueContractualBaseHours
    + input.calendarReplacementHours
    + paidLeaveDueHours
    + publicHolidayDueHours
  const payslipTotalHours = input.payslipHours + input.payslipPaidLeaveHours

  return mapValuesToRoundedMinutes({
    contractualRealizedHours,
    guaranteedBaseHours,
    overtimeHours,
    paidLeaveDueHours,
    publicHolidayDueHours,
    totalDueHours,
    payslipTotalHours,
    remainingToWorkHours: Math.max(0, input.annualContractHours - contractualRealizedHours),
    payBalanceHours: totalDueHours - payslipTotalHours,
  })
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date.getTime())
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function mapValuesToRoundedMinutes(summary: AnnualSummary): AnnualSummary {
  return Object.fromEntries(
    Object.entries(summary).map(([key, value]) => [key, roundHoursToMinute(value)]),
  ) as unknown as AnnualSummary
}

function validateInput(input: AnnualSummaryInput): void {
  const hourFields: Array<[string, number]> = [
    ['annualContractHours', input.annualContractHours],
    ['calendarContractHours', input.calendarContractHours],
    ['calendarAbsenceHours', input.calendarAbsenceHours],
    ['calendarReplacementHours', input.calendarReplacementHours],
    ['calendarPublicHolidayHours', input.calendarPublicHolidayHours],
    ['payslipHours', input.payslipHours],
    ['payslipPaidLeaveHours', input.payslipPaidLeaveHours],
  ]

  for (const [name, value] of hourFields) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} must be a finite, non-negative number`)
    }
  }

  const fullTimeAnnualHours = input.fullTimeAnnualHours ?? DEFAULT_FULL_TIME_ANNUAL_HOURS
  if (!Number.isFinite(fullTimeAnnualHours) || fullTimeAnnualHours <= 0) {
    throw new RangeError('fullTimeAnnualHours must be a finite number greater than zero')
  }

  assertYear(input.schoolSeason.startYear, 'schoolSeason.startYear')
}

function assertYear(year: number, name: string): void {
  if (!Number.isInteger(year) || year < 1583 || year > 9999) {
    throw new RangeError(`${name} must be an integer between 1583 and 9999`)
  }
}
