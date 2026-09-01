import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UnassignedEvent } from '../types'
import { UnassignedEventsPage } from './UnassignedEventsPage'

const getUnassignedEvents = vi.fn()

vi.mock('../services/api', () => ({
  getUnassignedEvents: (...args: unknown[]) => getUnassignedEvents(...args),
}))

const events: UnassignedEvent[] = [
  {
    id: 'event-1', googleEventId: 'google-1', title: 'Cours enfants', description: 'Prévoir les baudriers.', location: 'Mur principal',
    startsAt: '2026-09-12T14:00:00+02:00', endsAt: '2026-09-12T16:00:00+02:00', allDay: false,
    sourceCalendarId: 'cours@example.fr', sourceCalendarName: 'Cours avec prépa', sourceCalendarColor: '#7986cb',
  },
  {
    id: 'event-3', googleEventId: 'google-3', title: 'Initiation adultes', description: 'Première séance.', location: 'Salle de bloc',
    startsAt: '2026-09-12T17:00:00+02:00', endsAt: '2026-09-12T18:30:00+02:00', allDay: false,
    sourceCalendarId: 'stages@example.fr', sourceCalendarName: 'Stages', sourceCalendarColor: '#f6bf26',
  },
  {
    id: 'event-2', googleEventId: 'google-2', title: 'Stage automne', description: 'Journée complète.', location: 'La Cordée',
    startsAt: '2026-10-03', endsAt: '2026-10-04', allDay: true,
    sourceCalendarId: 'stages@example.fr', sourceCalendarName: 'Stages', sourceCalendarColor: '#f6bf26',
  },
]

describe('UnassignedEventsPage', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    getUnassignedEvents.mockResolvedValue(events)
  })

  it('groups events from the same day into one daily card', async () => {
    render(<UnassignedEventsPage />)

    expect(await screen.findByRole('heading', { name: 'Septembre 2026' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Octobre 2026' })).toBeInTheDocument()
    const septemberDay = screen.getByRole('article', { name: 'Samedi 12 septembre' })
    expect(within(septemberDay).getByRole('heading', { name: 'Cours enfants' })).toBeInTheDocument()
    expect(within(septemberDay).getByRole('heading', { name: 'Initiation adultes' })).toBeInTheDocument()
    expect(within(septemberDay).getByText('2 événements')).toBeInTheDocument()
    expect(within(septemberDay).getByText('Prévoir les baudriers.')).toBeInTheDocument()
    expect(within(septemberDay).getByText('Mur principal')).toBeInTheDocument()
    expect(screen.getByText('Toute la journée')).toBeInTheDocument()
  })

  it('allows several source calendars to be selected independently', async () => {
    render(<UnassignedEventsPage />)
    const courses = await screen.findByRole('checkbox', { name: 'Cours avec prépa' })
    const stages = screen.getByRole('checkbox', { name: 'Stages' })

    expect(courses).toBeChecked()
    expect(stages).toBeChecked()
    fireEvent.click(courses)

    expect(screen.queryByRole('heading', { name: 'Cours enfants' })).not.toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Samedi 12 septembre' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Initiation adultes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Stage automne' })).toBeInTheDocument()
  })

  it('provides clear guidance when no calendar is selected', async () => {
    render(<UnassignedEventsPage />)
    await screen.findByRole('heading', { name: 'Septembre 2026' })

    fireEvent.click(screen.getByRole('button', { name: 'Aucun' }))

    expect(screen.getByText('Aucun événement avec ces calendriers')).toBeInTheDocument()
  })
})
