import { describe, expect, it } from 'vitest'
import type { UnassignedEvent } from '../types'
import { isEventWithinNextDays } from './unassignedEvents'

const eventAt = (startsAt: string): UnassignedEvent => ({
  id: startsAt, googleEventId: startsAt, title: 'Événement', description: '', location: '', startsAt,
  endsAt: startsAt, allDay: false, sourceCalendarId: 'calendar', sourceCalendarName: 'Calendrier', sourceCalendarColor: null,
})

describe('isEventWithinNextDays', () => {
  const now = new Date('2026-09-01T10:00:00+02:00')

  it('includes upcoming events strictly before the seven-day boundary', () => {
    expect(isEventWithinNextDays(eventAt('2026-09-08T09:59:59+02:00'), now, 7)).toBe(true)
  })

  it('excludes past events and the exact seven-day boundary', () => {
    expect(isEventWithinNextDays(eventAt('2026-09-01T09:59:59+02:00'), now, 7)).toBe(false)
    expect(isEventWithinNextDays(eventAt('2026-09-08T10:00:00+02:00'), now, 7)).toBe(false)
  })
})
