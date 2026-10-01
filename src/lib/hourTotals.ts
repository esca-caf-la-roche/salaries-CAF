export interface CategorizedHours {
  contractHours: number
  absenceHours: number
  replacementHours: number
  publicHolidayHours: number
}

export function calculateRetainedHours(hours: CategorizedHours): number {
  return hours.contractHours - hours.absenceHours + hours.replacementHours + hours.publicHolidayHours
}

/** Calendar work performed, excluding absences and non-worked public holidays. */
export function calculateWorkedHours(hours: CategorizedHours): number {
  return hours.contractHours + hours.replacementHours
}
