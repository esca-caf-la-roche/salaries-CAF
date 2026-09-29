import { formatHoursMinutes } from './annualSummary'
import { calendarYearFor } from './format'
import type { EmployeeSummary, MonthlyEventHour } from '../types'

const slotDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' })
const slotTime = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
const monthTitle = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })

/** Jeu. 03/09 09:00–11:00 */
export const eventSlotLabel = (event: MonthlyEventHour) =>
  `${slotDate.format(new Date(event.startsAt))} ${slotTime.format(new Date(event.startsAt))}–${slotTime.format(new Date(event.endsAt))}`

/** 2:30 (2:00 × 1,25) — format horaire de l'écran, identique au reste de l'application. */
export const eventClockLabel = (event: MonthlyEventHour) =>
  event.coefficient === 1.25
    ? `${formatHoursMinutes(event.weightedHours)} (${formatHoursMinutes(event.rawHours)} × 1,25)`
    : formatHoursMinutes(event.weightedHours)

export const splitByCategory = (events: MonthlyEventHour[]) => ({
  absences: events.filter((event) => event.hourCategory === 'absence'),
  replacements: events.filter((event) => event.hourCategory === 'replacement'),
})

export const sumWeightedHours = (events: MonthlyEventHour[]) =>
  events.reduce((total, event) => total + event.weightedHours, 0)

const hundredthsLabel = (hundredths: number) =>
  `${(hundredths / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`

/**
 * Arrondit chaque créneau au centième en répartissant le reliquat (plus grand reste)
 * pour que la somme des lignes affichées soit exactement l'arrondi de la somme réelle —
 * donc exactement le total de `monthly_hours` affiché à l'écran.
 */
function apportionHundredths(events: MonthlyEventHour[]): number[] {
  const exact = events.map((event) => event.weightedHours * 100)
  const rounded = exact.map((value) => Math.floor(value))
  let residual = Math.round(exact.reduce((total, value) => total + value, 0)) - rounded.reduce((total, value) => total + value, 0)
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder)
  for (let position = 0; residual !== 0 && byRemainder.length > 0; position = (position + 1) % byRemainder.length) {
    const target = residual > 0 ? byRemainder[position].index : byRemainder[byRemainder.length - 1 - position].index
    rounded[target] += residual > 0 ? 1 : -1
    residual += residual > 0 ? -1 : 1
  }
  return rounded
}

const reportHoursLabel = (event: MonthlyEventHour, hundredths: number) =>
  event.coefficient === 1.25 ? `${hundredthsLabel(hundredths)} (× 1,25)` : hundredthsLabel(hundredths)

export type AbsenceMonthMonitor = { employee: EmployeeSummary; events: MonthlyEventHour[] }

/**
 * Rapport texte d'un mois complet, prêt à coller pour PSA :
 * moniteur par moniteur, absences et remplacements strictement séparés,
 * heures en décimales avec le coefficient de préparation inclus.
 * Les totaux sont exactement ceux de `monthly_hours`, et les lignes additionnent exactement.
 */
export function buildAbsenceMonthReport(schoolYear: number, month: number, monitors: AbsenceMonthMonitor[]): string {
  const title = monthTitle.format(new Date(Date.UTC(calendarYearFor(schoolYear, month), month - 1, 1)))
  const lines = [`Absences et remplacements — ${title}`, `Saison ${schoolYear}–${schoolYear + 1}`, '']
  let absenceTotal = 0
  let replacementTotal = 0

  for (const { employee, events } of monitors) {
    const { absences, replacements } = splitByCategory(events)
    const absenceHours = apportionHundredths(absences)
    const replacementHours = apportionHundredths(replacements)
    const monitorAbsenceTotal = absenceHours.reduce((total, value) => total + value, 0)
    const monitorReplacementTotal = replacementHours.reduce((total, value) => total + value, 0)
    absenceTotal += monitorAbsenceTotal
    replacementTotal += monitorReplacementTotal
    lines.push(employee.name)
    lines.push(`Absences — ${hundredthsLabel(monitorAbsenceTotal)}`)
    absences.forEach((event, index) => lines.push(`  ${eventSlotLabel(event)} · ${event.title} · ${reportHoursLabel(event, absenceHours[index])}`))
    lines.push(`Remplacements — ${hundredthsLabel(monitorReplacementTotal)}`)
    replacements.forEach((event, index) => lines.push(`  ${eventSlotLabel(event)} · ${event.title} · ${reportHoursLabel(event, replacementHours[index])}`))
    lines.push('')
  }

  lines.push(`Total ${title} — Absences : ${hundredthsLabel(absenceTotal)} · Remplacements : ${hundredthsLabel(replacementTotal)}`)
  return lines.join('\n')
}
