import { calculateAnnualSummary } from './annualSummary'
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

export function buildWorkerRecap(employee: EmployeeSummary, schoolYear: number): WorkerRecap {
  const totals = employee.monthlyHours.reduce((sum, month) => ({
    contract: sum.contract + month.contractHours,
    absence: sum.absence + month.absenceHours,
    replacement: sum.replacement + month.replacementHours,
    publicHoliday: sum.publicHoliday + month.publicHolidayHours,
  }), { contract: 0, absence: 0, replacement: 0, publicHoliday: 0 })
  const actualHours = calculateAnnualSummary({
    contractType: employee.contractType,
    annualContractHours: employee.annualContractHours,
    calendarContractHours: totals.contract,
    calendarAbsenceHours: totals.absence,
    calendarReplacementHours: totals.replacement,
    calendarPublicHolidayHours: totals.publicHoliday,
    payslipHours: 0,
    payslipPaidLeaveHours: 0,
    schoolSeason: { startYear: schoolYear },
    fullTimeAnnualHours: employee.settings.fullTimeAnnualMinutes / 60,
  }).contractualRealizedHours
  return {
    employee,
    contractHours: employee.annualContractHours,
    actualHours,
    differenceHours: employee.contractType === 'INDEP' ? null : actualHours - employee.annualContractHours,
    absenceHours: totals.absence,
    replacementHours: totals.replacement,
    publicHolidayHours: totals.publicHoliday,
  }
}
