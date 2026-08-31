import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigurationPage } from './ConfigurationPage'
import type { EmployeeResource } from '../types'

const resource: EmployeeResource = {
  id: 'employee-1',
  calendarId: 'calendar-1',
  googleCalendarId: 'employee-1@resource.calendar.google.com',
  name: 'Alice Martin',
  color: '#3f7f73',
  enabled: false,
  loginEmail: '',
  eventCount: 4,
  lastSyncedAt: null,
}

const getResources = vi.fn()
const discoverResources = vi.fn()
const saveResources = vi.fn()
const startGoogleConnection = vi.fn()

vi.mock('../services/api', () => ({
  getResources: (...args: unknown[]) => getResources(...args),
  discoverResources: (...args: unknown[]) => discoverResources(...args),
  saveResources: (...args: unknown[]) => saveResources(...args),
  startGoogleConnection: (...args: unknown[]) => startGoogleConnection(...args),
}))

describe('ConfigurationPage', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    getResources.mockResolvedValue([structuredClone(resource)])
    discoverResources.mockResolvedValue([structuredClone(resource)])
    saveResources.mockImplementation(async (resources: EmployeeResource[]) => resources)
  })

  it('shows employee resources instead of event calendars and coefficients', async () => {
    render(<ConfigurationPage />)

    expect(await screen.findByText('Alice Martin')).toBeInTheDocument()
    expect(screen.getByText('employee-1@resource.calendar.google.com', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('E-mail de connexion')).toBeInTheDocument()
    expect(screen.queryByText('Coefficient')).not.toBeInTheDocument()
  })

  it('requires a valid login email before enabling a resource', async () => {
    render(<ConfigurationPage />)
    const toggle = await screen.findByRole('checkbox')
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }))

    expect(await screen.findByText('Ajoutez un e-mail de connexion valide pour Alice Martin.')).toBeInTheDocument()
    expect(saveResources).not.toHaveBeenCalled()
  })

  it('saves the selected resource with its normalized login field', async () => {
    render(<ConfigurationPage />)
    fireEvent.click(await screen.findByRole('checkbox'))
    fireEvent.change(screen.getByRole('textbox', { name: 'E-mail de connexion de Alice Martin' }), {
      target: { value: 'alice@example.fr' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }))

    await waitFor(() => expect(saveResources).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'employee-1', enabled: true, loginEmail: 'alice@example.fr' }),
    ]))
  })
})
