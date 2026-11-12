import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReplacementCalendar } from './ReplacementCalendar'
import type { ReplacementEvent } from '../types'

afterEach(cleanup)
const event: ReplacementEvent = { id: 'overnight', title: 'Cours de nuit', startsAt: '2026-10-31T23:00:00', endsAt: '2026-11-01T02:00:00', resourceId: 'resource', originalResourceId: 'resource' }

describe('ReplacementCalendar', () => {
  it('renders an event starting in the previous month on its overlapping day', () => {
    render(<ReplacementCalendar month={new Date(2026, 10, 1)} events={[event]} selectedIds={['overnight']} onToggle={() => {}} />)
    const day = screen.getByRole('region', { name: 'dimanche 1 novembre' })
    expect(within(day).getByRole('checkbox', { name: /Cours de nuit/ })).toBeChecked()
    expect(within(day).getByText(/31 oct/)).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  })

  it('does not extend an event ending at midnight into the next day', () => {
    render(<ReplacementCalendar month={new Date(2026, 10, 1)} events={[{ ...event, startsAt: '2026-11-02T23:00:00', endsAt: '2026-11-03T00:00:00' }]} selectedIds={[]} onToggle={() => {}} />)
    expect(within(screen.getByRole('region', { name: 'lundi 2 novembre' })).getByRole('checkbox')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'mardi 3 novembre' })).queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
