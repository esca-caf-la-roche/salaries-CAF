import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigurationPage } from './ConfigurationPage'
import type { EmployeeResource, UsedCalendarCoefficient } from '../types'

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

const usedCalendar: UsedCalendarCoefficient = {
  googleCalendarId: 'course-1@group.calendar.google.com',
  name: 'Cours du mardi',
  coefficient: null,
  eventCount: 12,
}

const getResources = vi.fn()
const getCoefficientCalendars = vi.fn()
const discoverResources = vi.fn()
const saveResources = vi.fn()
const saveCoefficientCalendars = vi.fn()
const startGoogleConnection = vi.fn()

vi.mock('../services/api', () => ({
  getResources: (...args: unknown[]) => getResources(...args),
  getCoefficientCalendars: (...args: unknown[]) => getCoefficientCalendars(...args),
  discoverResources: (...args: unknown[]) => discoverResources(...args),
  saveResources: (...args: unknown[]) => saveResources(...args),
  saveCoefficientCalendars: (...args: unknown[]) => saveCoefficientCalendars(...args),
  startGoogleConnection: (...args: unknown[]) => startGoogleConnection(...args),
}))

describe('ConfigurationPage', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    getResources.mockResolvedValue([structuredClone(resource)])
    getCoefficientCalendars.mockResolvedValue([structuredClone(usedCalendar)])
    discoverResources.mockResolvedValue([structuredClone(resource)])
    saveResources.mockImplementation(async (resources: EmployeeResource[]) => resources)
    saveCoefficientCalendars.mockImplementation(async (calendars: UsedCalendarCoefficient[]) => calendars)
  })

  it('shows employee resources and only detected event calendars', async () => {
    render(<ConfigurationPage />)

    expect(await screen.findByText('Alice Martin')).toBeInTheDocument()
    expect(screen.getByText('employee-1@resource.calendar.google.com', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('E-mail de connexion')).toBeInTheDocument()
    expect(await screen.findByText('Cours du mardi')).toBeInTheDocument()
    expect(screen.getByText('course-1@group.calendar.google.com', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Coefficient')).toBeInTheDocument()
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

  it('saves one of the two supported coefficients for a detected calendar', async () => {
    render(<ConfigurationPage />)
    fireEvent.change(await screen.findByRole('combobox', { name: 'Coefficient de Cours du mardi' }), {
      target: { value: '1.25' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les coefficients' }))

    await waitFor(() => expect(saveCoefficientCalendars).toHaveBeenCalledWith([
      expect.objectContaining({ googleCalendarId: usedCalendar.googleCalendarId, coefficient: 1.25 }),
    ]))
  })
})
