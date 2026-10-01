import { calculateAnnualSummary, calculateCdiPublicHolidayHours, CDI_FULL_TIME_ANNUAL_HOURS, getFrenchPublicHolidaysForSchoolSeason, isWeekday, resolveContractBases, type FrenchPublicHoliday } from './annualSummary'
import type { EmployeeSummary } from '../types'

export interface WorkerRecap {
  employee: EmployeeSummary
  contractHours: number
  actualHours: number
  differenceHours: number | null
  absenceHours: number
  replacementHours: number
  publicHolidayHours: number
}

export function buildWorkerRecap(employee: EmployeeSummary, schoolYear: number, holidays: FrenchPublicHoliday[] = getFrenchPublicHolidaysForSchoolSeason({ startYear: schoolYear })): WorkerRecap {
  const totals = employee.monthlyHours.reduce((sum, month) => ({
    contract: sum.contract + month.contractHours,
    absence: sum.absence + month.absenceHours,
    replacement: sum.replacement + month.replacementHours,
    publicHoliday: sum.publicHoliday + month.publicHolidayHours,
  }), { contract: 0, absence: 0, replacement: 0, publicHoliday: 0 })
  const sickLeaveHours = employee.contractType !== 'INDEP'
    ? employee.payroll.reduce((sum, entry) => sum + entry.sickLeaveHundredthHours, 0) / 100
    : 0
  // Same HCAR/HT as the annual summary (single source of truth).
  const { adjustedContractHours, workedHours } = resolveContractBases({
    contractType: employee.contractType,
    annualContractHours: employee.annualContractHours,
    calendarContractHours: totals.contract,
    calendarAbsenceHours: totals.absence,
    calendarReplacementHours: totals.replacement,
    calendarPublicHolidayHours: totals.publicHoliday,
    sickLeaveHours,
  })
  const publicHolidayHours = employee.contractType === 'CDI'
    ? calculateCdiPublicHolidayHours({
      adjustedContractHours,
      // Same fixed full-time reference as the tracking page so both views cannot drift.
      fullTimeAnnualHours: CDI_FULL_TIME_ANNUAL_HOURS,
      realizedHoursExcludingHolidays: workedHours,
      weekdayHolidayCount: holidays.filter(({ date }) => isWeekday(date)).length,
    }).totalHours
    : totals.publicHoliday
  const summary = calculateAnnualSummary({
    contractType: employee.contractType,
    annualContractHours: employee.annualContractHours,
    calendarContractHours: totals.contract,
    calendarAbsenceHours: totals.absence,
    calendarReplacementHours: totals.replacement,
    calendarPublicHolidayHours: publicHolidayHours,
    payslipHours: 0,
    payslipPaidLeaveHours: 0,
    sickLeaveHours,
    schoolSeason: { startYear: schoolYear },
    fullTimeAnnualHours: employee.settings.fullTimeAnnualMinutes / 60,
  })
  return {
    employee,
    contractHours: employee.annualContractHours,
    actualHours: employee.contractType === 'CDI' || employee.contractType === 'CDII' ? summary.workedHours : summary.contractualRealizedHours,
    // HT - HCAR: positive means time worked above the adjusted contract (opposite sign of the
    // "reste à réaliser" shown in the tracking page, which is HCAR - HT).
    differenceHours: employee.contractType === 'INDEP' ? null : summary.workedHours - summary.adjustedContractHours,
    absenceHours: totals.absence,
    replacementHours: totals.replacement,
    publicHolidayHours,
  }
}
