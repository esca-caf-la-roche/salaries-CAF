import { schoolMonths } from './format'

export interface SchoolMonth {
  schoolYear: number
  month: number
}

export function schoolMonthForDate(date: Date): SchoolMonth {
  const month = date.getMonth() + 1
  return { schoolYear: month >= 9 ? date.getFullYear() : date.getFullYear() - 1, month }
}

export function previousSchoolMonth(date: Date): SchoolMonth {
  return schoolMonthForDate(new Date(date.getFullYear(), date.getMonth() - 1, 1))
}

export function completedMonthsForSchoolYear(schoolYear: number, date: Date): number[] {
  const currentMonthStart = new Date(date.getFullYear(), date.getMonth(), 1)
  return schoolMonths.filter((month) => {
    const calendarYear = month >= 9 ? schoolYear : schoolYear + 1
    return new Date(calendarYear, month, 1) <= currentMonthStart
  })
}
