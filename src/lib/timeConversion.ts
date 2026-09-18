export function hoursMinutesToDecimal(hours: number, minutes: number) {
  return Math.round((hours + minutes / 60) * 100) / 100
}

export function decimalHoursToMinutes(decimalHours: number) {
  const totalMinutes = Math.round(decimalHours * 60)
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  }
}

export function parseFrenchDecimal(value: string) {
  const normalized = value.trim().replace(',', '.')
  if (!normalized || !/^\d+(?:\.\d+)?$/.test(normalized)) return null
  const result = Number(normalized)
  return Number.isFinite(result) ? result : null
}
