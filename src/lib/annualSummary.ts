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
  sickLeaveHours: number
  schoolSeason: SchoolSeason
  fullTimeAnnualHours?: number
}

export interface AnnualSummary {
  /** HT: worked hours, excluding absences, paid leave and (for a CDI) public holidays. */
  workedHours: number
  /** HCAR: annual contract adjusted by absences and replacements. */
  adjustedContractHours: number
  contractualRealizedHours: number
  /** Guaranteed base including calculated public holidays for a CDI. */
  guaranteedBaseHours: number
  /** Base used for the 10% paid leave (maximum of HCAR and HT), excluding public holidays. */
  paidLeaveBaseHours: number
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

export interface CdiPublicHolidayCalculation {
  coefficient: number
  hoursPerHoliday: number
  totalHours: number
  /** Base of the coefficient: the higher of the adjusted contract and the worked hours. */
  coefficientBaseHours: number
  basis: 'contract' | 'realized'
}

export const CDI_FULL_TIME_ANNUAL_HOURS = 1582
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
  return getFrenchPublicHolidaysForSchoolSeason(season)
    .filter(({ date }) => isWeekday(date))
    .length
}

export function getFrenchPublicHolidaysForSchoolSeason(season: SchoolSeason): FrenchPublicHoliday[] {
  assertYear(season.startYear, 'schoolSeason.startYear')

  const seasonStart = utcDate(season.startYear, 9, 1).getTime()
  const seasonEnd = utcDate(season.startYear + 1, 8, 31).getTime()

  return [season.startYear, season.startYear + 1]
    .flatMap(getFrenchMetropolitanPublicHolidays)
    .filter(({ date }) => {
      const timestamp = date.getTime()
      return timestamp >= seasonStart && timestamp <= seasonEnd
    })
    .sort((left, right) => left.date.getTime() - right.date.getTime())
}

export function isWeekday(date: Date): boolean {
  const day = date.getUTCDay()
  return day >= 1 && day <= 5
}

/**
 * Public holidays for a CDI follow the annual contract coefficient: each worked holiday is worth
 * `7 × coefficient`, where `coefficient = base / full-time annual hours`. The base is the adjusted
 * contract (HCAR) while the worked hours (HT) stay below it, then the worked hours once they exceed
 * the adjusted contract. This keeps the rule "HCAR/1582 below, HT/1582 above" explicit and simple.
 */
export function calculateCdiPublicHolidayHours({
  adjustedContractHours,
  fullTimeAnnualHours = CDI_FULL_TIME_ANNUAL_HOURS,
  realizedHoursExcludingHolidays,
  weekdayHolidayCount,
}: {
  adjustedContractHours: number
  fullTimeAnnualHours?: number
  realizedHoursExcludingHolidays: number
  weekdayHolidayCount: number
}): CdiPublicHolidayCalculation {
  for (const [name, value] of [
    ['adjustedContractHours', adjustedContractHours],
    ['fullTimeAnnualHours', fullTimeAnnualHours],
    ['weekdayHolidayCount', weekdayHolidayCount],
  ] as Array<[string, number]>) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a finite, non-negative number`)
  }
  if (fullTimeAnnualHours <= 0) throw new RangeError('fullTimeAnnualHours must be greater than zero')
  if (!Number.isFinite(realizedHoursExcludingHolidays) || realizedHoursExcludingHolidays < 0) {
    throw new RangeError('realizedHoursExcludingHolidays must be a finite, non-negative number')
  }

  const holidayFullTimeHours = weekdayHolidayCount * 7
  if (holidayFullTimeHours >= fullTimeAnnualHours) {
    throw new RangeError('weekdayHolidayCount produces an invalid full-time reference')
  }

  const coefficientBaseHours = Math.max(adjustedContractHours, realizedHoursExcludingHolidays)
  const coefficient = coefficientBaseHours / fullTimeAnnualHours
  const hoursPerHoliday = 7 * coefficient

  return {
    coefficient,
    hoursPerHoliday,
    totalHours: weekdayHolidayCount * hoursPerHoliday,
    coefficientBaseHours,
    basis: realizedHoursExcludingHolidays > adjustedContractHours ? 'realized' : 'contract',
  }
}

export interface ContractBasesInput {
  contractType: ContractType
  annualContractHours: number
  calendarContractHours: number
  calendarAbsenceHours: number
  calendarReplacementHours: number
  calendarPublicHolidayHours: number
  sickLeaveHours: number
}

export interface ContractBases {
  /** HCAR: annual contract − absences + replacements, clamped to zero when negative. */
  adjustedContractHours: number
  /** HT: worked hours, excluding absences, paid leave and (for a CDI) public holidays. */
  workedHours: number
  /**
   * Raw realized hours used by the CDD and independent formulas (a CDI's CDI rules never use it;
   * its holiday-inclusive total is rebuilt by calculateCdiPublicHolidayHours instead).
   */
  contractualRealizedHours: number
}

/**
 * Single source of truth for HCAR and HT. Both the annual summary and the
 * dashboard/tracking views derive the holiday coefficient from these values, so the
 * rule must only live here.
 */
export function resolveContractBases(input: ContractBasesInput): ContractBases {
  const isCdi = input.contractType === 'CDI'
  const isCdii = input.contractType === 'CDII'
  const adjustsAnnualTarget = isCdi || isCdii
  const contractualRealizedHours = input.contractType === 'INDEP'
    ? input.calendarContractHours + input.calendarAbsenceHours + input.calendarReplacementHours + input.calendarPublicHolidayHours
    : isCdi
      ? input.calendarContractHours + input.calendarPublicHolidayHours + input.calendarReplacementHours - input.calendarAbsenceHours + input.sickLeaveHours
      : input.calendarContractHours + input.calendarAbsenceHours + input.sickLeaveHours + input.calendarPublicHolidayHours
  // Sick leave counts as worked time. For a CDII the calendar public holidays are also worked time;
  // for a CDI they are added separately to the guaranteed base.
  const workedHours = isCdi
    ? input.calendarContractHours + input.calendarReplacementHours + input.sickLeaveHours
    : isCdii
      ? input.calendarContractHours + input.calendarReplacementHours + input.calendarPublicHolidayHours + input.sickLeaveHours
      : contractualRealizedHours
  return {
    adjustedContractHours: adjustsAnnualTarget
      ? Math.max(0, input.annualContractHours - input.calendarAbsenceHours + input.calendarReplacementHours)
      : input.annualContractHours,
    workedHours,
    contractualRealizedHours,
  }
}

export function calculateAnnualSummary(input: AnnualSummaryInput): AnnualSummary {
  validateInput(input)

  if (input.contractType === 'INDEP') {
    const { contractualRealizedHours: realizedHours } = resolveContractBases({
      contractType: input.contractType,
      annualContractHours: input.annualContractHours,
      calendarContractHours: input.calendarContractHours,
      calendarAbsenceHours: input.calendarAbsenceHours,
      calendarReplacementHours: input.calendarReplacementHours,
      calendarPublicHolidayHours: input.calendarPublicHolidayHours,
      sickLeaveHours: input.sickLeaveHours,
    })
    return {
      workedHours: realizedHours,
      adjustedContractHours: 0,
      contractualRealizedHours: realizedHours,
      guaranteedBaseHours: realizedHours,
      paidLeaveBaseHours: 0,
      overtimeHours: 0,
      paidLeaveDueHours: 0,
      publicHolidayDueHours: 0,
      totalDueHours: realizedHours,
      payslipTotalHours: input.payslipHours,
      remainingToWorkHours: 0,
      payBalanceHours: realizedHours - input.payslipHours,
    }
  }

  const isCdi = input.contractType === 'CDI'
  const isCdii = input.contractType === 'CDII'
  const adjustsAnnualTarget = isCdi || isCdii
  const sickLeaveHours = input.sickLeaveHours
  const ordinaryRealizedHours = input.calendarContractHours + input.calendarAbsenceHours + sickLeaveHours
  const { adjustedContractHours, workedHours, contractualRealizedHours } = resolveContractBases({
    contractType: input.contractType,
    annualContractHours: input.annualContractHours,
    calendarContractHours: input.calendarContractHours,
    calendarAbsenceHours: input.calendarAbsenceHours,
    calendarReplacementHours: input.calendarReplacementHours,
    calendarPublicHolidayHours: input.calendarPublicHolidayHours,
    sickLeaveHours,
  })
  // Base garantie hors fériés : l'objectif ajusté reste garanti tant qu'il n'est pas dépassé,
  // sinon ce sont les heures réellement travaillées qui comptent.
  const paidLeaveBaseHours = isCdi
    ? Math.max(adjustedContractHours, workedHours)
    : 0
  const guaranteedBaseHours = isCdi
    ? paidLeaveBaseHours + input.calendarPublicHolidayHours
    : isCdii
      ? Math.max(adjustedContractHours, workedHours)
      : Math.max(input.annualContractHours, ordinaryRealizedHours)
  const overtimeHours = adjustsAnnualTarget
    ? Math.max(0, workedHours - adjustedContractHours)
    : Math.max(0, contractualRealizedHours - input.annualContractHours)
  // Congés payés théoriques = 10 % de la base seule (hors fériés).
  const paidLeaveDueHours = isCdi ? paidLeaveBaseHours * 0.1 : 0
  const publicHolidayDueHours = isCdi ? input.calendarPublicHolidayHours : 0
  const totalDueHours = isCdi
    ? guaranteedBaseHours + paidLeaveDueHours
    : isCdii
      ? guaranteedBaseHours
      : Math.max(guaranteedBaseHours, contractualRealizedHours) + input.calendarReplacementHours
  const payslipTotalHours = input.payslipHours + input.payslipPaidLeaveHours + sickLeaveHours

  return {
    workedHours,
    adjustedContractHours,
    contractualRealizedHours,
    guaranteedBaseHours,
    paidLeaveBaseHours,
    overtimeHours,
    paidLeaveDueHours,
    publicHolidayDueHours,
    totalDueHours,
    payslipTotalHours,
    remainingToWorkHours: adjustsAnnualTarget
      ? Math.max(0, adjustedContractHours - workedHours)
      : Math.max(0, input.annualContractHours - contractualRealizedHours),
    payBalanceHours: totalDueHours - payslipTotalHours,
  }
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date.getTime())
  result.setUTCDate(result.getUTCDate() + days)
  return result
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
    ['sickLeaveHours', input.sickLeaveHours],
  ]

  for (const [name, value] of hourFields) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} must be a finite, non-negative number`)
    }
  }

  const fullTimeAnnualHours = input.fullTimeAnnualHours ?? CDI_FULL_TIME_ANNUAL_HOURS
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
