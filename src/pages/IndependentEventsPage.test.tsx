import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IndependentEvent } from '../types'
import { IndependentEventsPage } from './IndependentEventsPage'

const getIndependentEvents = vi.fn()

vi.mock('../services/api', () => ({
  getIndependentEvents: (...args: unknown[]) => getIndependentEvents(...args),
}))

const events: IndependentEvent[] = [
  {
    employeeId: 'indep-1', employeeName: 'Alice', id: 'event-1', googleEventId: 'google-1', title: 'Cours enfants', description: 'Prévoir les baudriers.', location: 'Mur principal',
    startsAt: '2026-09-12T14:00:00+02:00', endsAt: '2026-09-12T16:00:00+02:00', allDay: false,
    sourceCalendarId: 'cours@example.fr', sourceCalendarName: 'Cours avec prépa', sourceCalendarColor: '#7986cb',
  },
  {
    employeeId: 'indep-2', employeeName: 'Bob', id: 'event-3', googleEventId: 'google-3', title: 'Initiation adultes', description: 'Première séance.', location: 'Salle de bloc',
    startsAt: '2026-09-12T17:00:00+02:00', endsAt: '2026-09-12T18:30:00+02:00', allDay: false,
    sourceCalendarId: 'stages@example.fr', sourceCalendarName: 'Stages', sourceCalendarColor: '#f6bf26',
  },
  {
    employeeId: 'indep-1', employeeName: 'Alice', id: 'event-2', googleEventId: 'google-2', title: 'Stage automne', description: 'Journée complète.', location: 'La Cordée',
    startsAt: '2026-10-03T09:00:00+02:00', endsAt: '2026-10-03T12:00:00+02:00', allDay: false,
    sourceCalendarId: 'stages@example.fr', sourceCalendarName: 'Stages', sourceCalendarColor: '#f6bf26',
  },
]

describe('IndependentEventsPage', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    getIndependentEvents.mockResolvedValue(events)
  })

  it('groups events from the same day into one daily card', async () => {
    render(<IndependentEventsPage />)

    expect(await screen.findByRole('heading', { name: 'Septembre 2026' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Octobre 2026' })).toBeInTheDocument()
    const septemberDay = screen.getByRole('article', { name: 'Samedi 12 septembre' })
    expect(within(septemberDay).getByRole('heading', { name: 'Cours enfants' })).toBeInTheDocument()
    expect(within(septemberDay).getByRole('heading', { name: 'Initiation adultes' })).toBeInTheDocument()
    expect(within(septemberDay).getByText('2 événements · 3:30 h')).toBeInTheDocument()
    expect(within(septemberDay).getByText('Prévoir les baudriers.')).toBeInTheDocument()
    expect(within(septemberDay).getByText('Mur principal')).toBeInTheDocument()
    expect(screen.getByText('6:30 h')).toBeInTheDocument()
  })

  it('allows several source calendars to be selected independently', async () => {
    render(<IndependentEventsPage />)
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
    render(<IndependentEventsPage />)
    await screen.findByRole('heading', { name: 'Septembre 2026' })

    fireEvent.click(screen.getByRole('button', { name: 'Aucun' }))

    expect(screen.getByText('Aucun événement avec ces filtres')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Imprimer' })).toBeDisabled()
  })

  it('opens the browser print dialog', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    render(<IndependentEventsPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Imprimer' }))

    expect(print).toHaveBeenCalledOnce()
    print.mockRestore()
  })
  it('filters the employee and recalculates actual hours without preparation', async () => {
    render(<IndependentEventsPage />)
    await screen.findByRole('heading', { name: 'Septembre 2026' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Indépendant' }), { target: { value: 'indep-1' } })
    expect(screen.queryByRole('heading', { name: 'Initiation adultes' })).not.toBeInTheDocument()
    expect(screen.getByText('5:00 h')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Stages' }))
    expect(screen.getByText('2:00 h', { selector: '.unassigned-total strong' })).toBeInTheDocument()
    expect(screen.getByText(/Calendriers : Cours avec prépa · Total réel : 2:00 h/)).toHaveTextContent('Alice')
  })

  it('loads the selected season and clears stale events on a failed load', async () => {
    render(<IndependentEventsPage />)
    await screen.findByRole('heading', { name: 'Septembre 2026' })
    getIndependentEvents.mockRejectedValueOnce(new Error('Unavailable'))
    const season = screen.getByRole('combobox', { name: 'Saison' }) as HTMLSelectElement
    const nextYear = Number(season.value) - 1
    fireEvent.change(season, { target: { value: String(nextYear) } })
    expect(getIndependentEvents).toHaveBeenLastCalledWith(nextYear)
    expect(await screen.findByRole('alert')).toHaveTextContent('n’ont pas pu être chargés')
    expect(screen.queryByRole('heading', { name: 'Cours enfants' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Imprimer' })).toBeDisabled()
  })

  it('ignores a previous season response that arrives after the current one', async () => {
    let resolveFirst!: (items: IndependentEvent[]) => void
    getIndependentEvents.mockImplementationOnce(() => new Promise<IndependentEvent[]>((resolve) => { resolveFirst = resolve }))
    render(<IndependentEventsPage />)
    const season = screen.getByRole('combobox', { name: 'Saison' }) as HTMLSelectElement
    fireEvent.change(season, { target: { value: String(Number(season.value) - 1) } })
    await screen.findByRole('heading', { name: 'Cours enfants' })
    await act(async () => { resolveFirst([{ ...events[0], title: 'Ancienne réponse' }]) })
    expect(screen.queryByRole('heading', { name: 'Ancienne réponse' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cours enfants' })).toBeInTheDocument()
  })

})
