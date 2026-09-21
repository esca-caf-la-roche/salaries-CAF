import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReplacementManagementPage } from './ReplacementManagementPage'
import type { EmployeeResource, ReplacementEvent, ReplacementResource } from '../types'

const resource: EmployeeResource = {
  id: 'employee-1',
  calendarId: 'calendar-1',
  googleCalendarId: 'employee-1@resource.calendar.google.com',
  name: '(CDII)-Alice Martin',
  color: '#3f7f73',
  enabled: true,
  loginEmail: '',
  contractType: 'CDII',
  annualContractHours: 820,
  paidMonths: 12,
  isUnassignedResource: false,
  eventCount: 2,
  lastSyncedAt: null,
}

const unassigned: EmployeeResource = {
  ...structuredClone(resource),
  id: 'employee-9',
  calendarId: 'calendar-9',
  googleCalendarId: 'c_1885o4bj2rlv4gijgd278pfg9rub0@resource.calendar.google.com',
  name: '(CDII)-A DETERMINER',
  isUnassignedResource: true,
}

const replacementEvent: ReplacementEvent = {
  id: 'evt-1',
  title: 'Cours du mardi',
  startsAt: '2026-10-06T09:00:00+02:00',
  endsAt: '2026-10-06T11:00:00+02:00',
  resourceId: 'employee-1@resource.calendar.google.com',
  originalResourceId: 'employee-1@resource.calendar.google.com',
}

const available: ReplacementResource[] = [
  { id: 'employee-2@resource.calendar.google.com', name: '(CDI)-Bruno Petit' },
]

const getResources = vi.fn()
const getReplacementEvents = vi.fn()
const getAvailableReplacementResources = vi.fn()
const processReplacements = vi.fn()

vi.mock('../services/api', () => ({
  getResources: (...args: unknown[]) => getResources(...args),
  getReplacementEvents: (...args: unknown[]) => getReplacementEvents(...args),
  getAvailableReplacementResources: (...args: unknown[]) => getAvailableReplacementResources(...args),
  processReplacements: (...args: unknown[]) => processReplacements(...args),
}))

describe('ReplacementManagementPage', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    getResources.mockResolvedValue([structuredClone(resource), structuredClone(unassigned)])
    getReplacementEvents.mockResolvedValue([structuredClone(replacementEvent)])
    getAvailableReplacementResources.mockResolvedValue(structuredClone(available))
    processReplacements.mockResolvedValue('1 remplacement(s) enregistré(s).')
  })

  it('runs the three-step workflow from resource selection to confirmation', async () => {
    render(<ReplacementManagementPage />)

    fireEvent.change(await screen.findByLabelText('Ressource concernée'), { target: { value: resource.googleCalendarId } })
    fireEvent.click(screen.getByRole('button', { name: /Choisir les événements/ }))

    expect(await screen.findByText('Cours du mardi')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Cours du mardi/ }))
    fireEvent.click(screen.getByRole('button', { name: /Attribuer 1 événement/ }))

    const select = await screen.findByRole('combobox', { name: /Remplaçant pour Cours du mardi/ })
    fireEvent.change(select, { target: { value: available[0].id } })
    expect(processReplacements).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer les remplacements/ }))

    await waitFor(() => expect(processReplacements).toHaveBeenCalledWith(resource.googleCalendarId, [
      { eventId: replacementEvent.id, replacementResourceId: available[0].id },
    ]))
    expect(await screen.findByText('1 remplacement(s) enregistré(s).')).toBeInTheDocument()
    expect(getReplacementEvents).toHaveBeenCalledWith(resource.googleCalendarId, expect.any(Number), expect.any(Number))
  })

  it('requests month events with a 1-based month for the selected resource', async () => {
    render(<ReplacementManagementPage />)
    fireEvent.change(await screen.findByLabelText('Ressource concernée'), { target: { value: resource.googleCalendarId } })
    fireEvent.click(screen.getByRole('button', { name: /Choisir les événements/ }))
    await waitFor(() => {
      const call = getReplacementEvents.mock.calls[0]
      expect(call[1]).toBeGreaterThan(1999)
      expect(call[2]).toBeGreaterThanOrEqual(1)
      expect(call[2]).toBeLessThanOrEqual(12)
    })
  })

  it('shows the backend error message when the month events fail to load', async () => {
    getReplacementEvents.mockRejectedValue(new Error('resourceCalendarId ne correspond pas à une ressource active'))
    render(<ReplacementManagementPage />)
    fireEvent.change(await screen.findByLabelText('Ressource concernée'), { target: { value: resource.googleCalendarId } })
    fireEvent.click(screen.getByRole('button', { name: /Choisir les événements/ }))
    expect(await screen.findByText('resourceCalendarId ne correspond pas à une ressource active')).toBeInTheDocument()
  })
})
