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
  const start = eventStart(event)
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
}

export function eventMonthLabel(event: UnassignedEvent): string {
  const label = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(eventStart(event))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function formatEventDate(event: UnassignedEvent): string {
  const start = eventStart(event)
  if (event.allDay) {
    return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(start)
  }
  const end = new Date(event.endsAt)
  const date = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' }).format(start)
  const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time.format(start)}–${time.format(end)}`
}
