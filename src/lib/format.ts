const frenchMonths = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
export const schoolMonths = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8] as const

export const monthLabel = (month: number) => frenchMonths[month - 1] ?? ''

export const schoolYearForDate = (date: Date) =>
  date.getMonth() + 1 >= 9 ? date.getFullYear() : date.getFullYear() - 1

export const formatHours = (hours: number) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(hours)

export const formatSyncDate = (iso: string | null) => {
  if (!iso) return 'Jamais synchronisé'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}
