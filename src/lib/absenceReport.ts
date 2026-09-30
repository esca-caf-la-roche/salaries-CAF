import { formatHoursMinutes } from './annualSummary'
import { calendarYearFor } from './format'
import type { EmployeeSummary, MonthlyEventHour } from '../types'

const slotDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' })
const slotTime = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
const monthTitle = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })

/** jeu. 03/09 09:00–11:00 — écran. */
export const eventSlotLabel = (event: MonthlyEventHour) =>
  `${slotDate.format(new Date(event.startsAt))} ${slotTime.format(new Date(event.startsAt))}–${slotTime.format(new Date(event.endsAt))}`

/** jeu. 03/09 — rapport PSA : la date suffit, les horaires et l'intitulé noient l'information. */
const eventDayLabel = (event: MonthlyEventHour) => slotDate.format(new Date(event.startsAt))

const dayKey = new Intl.DateTimeFormat('fr-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Paris' })

/**
 * Regroupe les créneaux d'une même journée : deux absences qui se suivent (17:00–19:30 puis
 * 19:30–20:45) ne font qu'une ligne « lun. 21/09 · 4,38 h ». L'ordre d'apparition est conservé.
 */
const groupByDay = (events: MonthlyEventHour[]): MonthlyEventHour[][] => {
  const days = new Map<string, MonthlyEventHour[]>()
  for (const event of events) {
    const key = dayKey.format(new Date(event.startsAt))
    const group = days.get(key)
    if (group) group.push(event)
    else days.set(key, [event])
  }
  // Clés AAAA-MM-JJ : le tri lexicographique est un tri chronologique, sans dépendre de l'ordre d'entrée.
  return [...days.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, group]) => group)
}

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
 * Arrondit chaque ligne au centième en répartissant le reliquat (plus grand reste)
 * pour que la somme des lignes affichées soit exactement l'arrondi de la somme réelle —
 * donc exactement le total de `monthly_hours` affiché à l'écran.
 */
function apportionHundredths(values: number[]): number[] {
  const exact = values.map((value) => value * 100)
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

export type AbsenceMonthMonitor = { employee: EmployeeSummary; events: MonthlyEventHour[] }

/**
 * Rapport texte d'un mois complet, prêt à coller pour PSA :
 * moniteur par moniteur, absences et remplacements strictement séparés,
 * une ligne par jour au format « lun. 21/09 · 4,38 h » — les créneaux d'une même
 * journée sont rassemblés (heures décimales, coefficient de préparation inclus).
 * Les totaux sont exactement ceux de `monthly_hours`, et les lignes additionnent exactement.
 */
export function buildAbsenceMonthReport(schoolYear: number, month: number, monitors: AbsenceMonthMonitor[]): string {
  const title = monthTitle.format(new Date(Date.UTC(calendarYearFor(schoolYear, month), month - 1, 1)))
  const lines = [`Absences et remplacements — ${title}`, '']
  let absenceTotal = 0
  let replacementTotal = 0

  for (const { employee, events } of monitors) {
    const { absences, replacements } = splitByCategory(events)
    const absenceDays = groupByDay(absences)
    const replacementDays = groupByDay(replacements)
    const absenceHours = apportionHundredths(absenceDays.map(sumWeightedHours))
    const replacementHours = apportionHundredths(replacementDays.map(sumWeightedHours))
    const monitorAbsenceTotal = absenceHours.reduce((total, value) => total + value, 0)
    const monitorReplacementTotal = replacementHours.reduce((total, value) => total + value, 0)
    absenceTotal += monitorAbsenceTotal
    replacementTotal += monitorReplacementTotal
    lines.push(employee.name)
    lines.push(`Absences — ${hundredthsLabel(monitorAbsenceTotal)}`)
    absenceDays.forEach((day, index) => lines.push(`  ${eventDayLabel(day[0])} · ${hundredthsLabel(absenceHours[index])}`))
    lines.push(`Remplacements — ${hundredthsLabel(monitorReplacementTotal)}`)
    replacementDays.forEach((day, index) => lines.push(`  ${eventDayLabel(day[0])} · ${hundredthsLabel(replacementHours[index])}`))
    lines.push('')
  }

  lines.push(`Total ${title} — Absences : ${hundredthsLabel(absenceTotal)} · Remplacements : ${hundredthsLabel(replacementTotal)}`)
  return lines.join('\n')
}
