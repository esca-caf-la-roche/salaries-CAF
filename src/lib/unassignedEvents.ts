import type { UnassignedEvent } from '../types'

export function eventStart(event: UnassignedEvent): Date {
  return new Date(event.allDay ? `${event.startsAt}T00:00:00` : event.startsAt)
}

export function isEventWithinNextDays(event: UnassignedEvent, now: Date, days: number): boolean {
  const start = eventStart(event).getTime()
  const end = now.getTime() + days * 24 * 60 * 60 * 1000
  return start >= now.getTime() && start < end
}

export function eventMonthKey(event: UnassignedEvent): string {
  return eventDayKey(event).slice(0, 7)
}

export function eventMonthLabel(event: UnassignedEvent): string {
  const label = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(eventStart(event))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function eventDayKey(event: UnassignedEvent): string {
  if (event.allDay) return event.startsAt.slice(0, 10)
  const parts = new Intl.DateTimeFormat('fr-FR', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Paris',
  }).formatToParts(eventStart(event))
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function eventDayLabel(event: UnassignedEvent): string {
  const label = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris',
  }).format(eventStart(event))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function formatEventTime(event: UnassignedEvent): string {
  if (event.allDay) return 'Toute la journée'
  const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
  return `${time.format(eventStart(event))}–${time.format(new Date(event.endsAt))}`
}

export function formatEventDate(event: UnassignedEvent): string {
  const start = eventStart(event)
  if (event.allDay) {
    return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(start)
  }
  const end = new Date(event.endsAt)
  const date = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' }).format(start)
  const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
  return `${date} · ${time.format(start)}–${time.format(end)}`
}
