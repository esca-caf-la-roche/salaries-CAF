import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigurationPage } from './ConfigurationPage'
import type { EmployeeResource, UsedCalendarCoefficient } from '../types'

const resource: EmployeeResource = {
  id: 'employee-1',
  calendarId: 'calendar-1',
  googleCalendarId: 'employee-1@resource.calendar.google.com',
  name: '(CDII)-Alice Martin',
  color: '#3f7f73',
  enabled: false,
  loginEmail: '',
  contractType: 'CDII',
  annualContractHours: 820,
  isUnassignedResource: false,
  eventCount: 4,
  lastSyncedAt: null,
}

const usedCalendar: UsedCalendarCoefficient = {
  googleCalendarId: 'course-1@group.calendar.google.com',
  name: 'Cours du mardi',
  color: '#7986cb',
  coefficient: null,
  hourCategory: null,
  eventCount: 12,
}

function resourceWith(overrides: Partial<EmployeeResource>): EmployeeResource {
  return { ...structuredClone(resource), ...overrides }
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

  it('shows employee resources and the seven Kanban destinations without dropdowns', async () => {
    render(<ConfigurationPage />)

    expect(await screen.findByText('(CDII)-Alice Martin')).toBeInTheDocument()
    expect(screen.getByText('employee-1@resource.calendar.google.com', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('E-mail de connexion')).toBeInTheDocument()
    expect(await screen.findByText('Cours du mardi')).toBeInTheDocument()
    expect(screen.getByText('course-1@group.calendar.google.com', { exact: false })).toBeInTheDocument()
    const kanban = document.querySelector('#calendriers-utilises')
    expect(kanban?.querySelectorAll('select')).toHaveLength(0)
    expect(screen.getByRole('region', { name: 'À définir' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Avec prépa' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Sans prépa' })).toBeInTheDocument()
    for (const name of ['Heures du contrat', "Heures d'absences", 'Heures de remplacements', 'Heures fériées']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    }
    expect(screen.getByLabelText('Type de contrat de (CDII)-Alice Martin')).toHaveTextContent('CDII')
    expect(screen.getByRole('spinbutton', { name: 'Heures annuelles de (CDII)-Alice Martin' })).toHaveValue(820)
    const calendarCard = screen.getByText('Cours du mardi').closest('.kanban-card')
    expect(calendarCard?.querySelector('.calendar-color')).toHaveStyle({ background: '#7986cb' })
  })

  it('groups followed resources by contract and keeps unused resources collapsed', async () => {
    getResources.mockResolvedValue([
      resourceWith({ id: 'cdi', name: '(CDI)-Camille', googleCalendarId: 'cdi@resource.google.com', contractType: 'CDI', enabled: true }),
      resourceWith({ id: 'cdii', name: '(CDII)-Alice', googleCalendarId: 'cdii@resource.google.com', contractType: 'CDII', enabled: true }),
      resourceWith({ id: 'cdd', name: '(CDD)-Chloé', googleCalendarId: 'cdd@resource.google.com', contractType: 'CDD', enabled: true }),
      resourceWith({ id: 'automatic', name: '(CDII)-A DETERMINER', googleCalendarId: 'auto@resource.google.com', contractType: null, enabled: true, isUnassignedResource: true }),
      resourceWith({ id: 'unknown', name: 'Nom sans préfixe', googleCalendarId: 'unknown@resource.google.com', contractType: null, enabled: true }),
      resourceWith({ id: 'unused', name: '(CDI)-Ignorée', googleCalendarId: 'unused@resource.google.com', contractType: 'CDI', enabled: false }),
    ])

    render(<ConfigurationPage />)

    expect(await screen.findByRole('region', { name: 'CDI' })).toHaveTextContent('(CDI)-Camille')
    expect(screen.getByRole('region', { name: 'CDII' })).toHaveTextContent('(CDII)-Alice')
    expect(screen.getByRole('region', { name: 'CDD' })).toHaveTextContent('(CDD)-Chloé')
    expect(screen.getByRole('region', { name: 'Sans contrat' })).toHaveTextContent('(CDII)-A DETERMINER')
    expect(screen.getByRole('region', { name: 'À vérifier' })).toHaveTextContent('Nom sans préfixe')

    const unusedDetails = screen.getByText('Ressources non suivies').closest('details')
    expect(unusedDetails).not.toHaveAttribute('open')
    fireEvent.click(screen.getByText('Ressources non suivies').closest('summary')!)
    expect(unusedDetails).toHaveAttribute('open')
    expect(unusedDetails).toHaveTextContent('(CDI)-Ignorée')
  })

  it('reveals a matching unused resource while searching', async () => {
    getResources.mockResolvedValue([
      resourceWith({ id: 'unused', name: '(CDD)-Zoé Martin', googleCalendarId: 'zoe@resource.google.com', contractType: 'CDD', enabled: false }),
    ])

    render(<ConfigurationPage />)
    await screen.findByText('(CDD)-Zoé Martin')
    const unusedDetails = screen.getByText('Ressources non suivies').closest('details')
    expect(unusedDetails).not.toHaveAttribute('open')

    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher une ressource' }), { target: { value: 'Zoé' } })

    expect(unusedDetails).toHaveAttribute('open')
    expect(screen.getByRole('textbox', { name: 'E-mail de connexion de (CDD)-Zoé Martin' })).toBeDisabled()
  })

  it('places complete cards in their hour category with a preparation badge', async () => {
    getCoefficientCalendars.mockResolvedValue([
      { ...usedCalendar, googleCalendarId: 'contract-prep', name: 'Cours préparé', coefficient: 1.25, hourCategory: 'contract' },
      { ...usedCalendar, googleCalendarId: 'contract-direct', name: 'Cours direct', coefficient: 1, hourCategory: 'contract' },
      { ...usedCalendar, googleCalendarId: 'absence-prep', name: 'Absence préparée', coefficient: 1.25, hourCategory: 'absence' },
      { ...usedCalendar, googleCalendarId: 'missing-coef', name: 'Coefficient manquant', coefficient: null, hourCategory: 'replacement' },
    ])

    render(<ConfigurationPage />)

    const contractLane = await screen.findByRole('region', { name: 'Heures du contrat' })
    expect(contractLane).toHaveTextContent('Cours préparé')
    expect(contractLane).toHaveTextContent('Cours direct')
    expect(contractLane).toHaveTextContent('Avec prépa · × 1,25')
    expect(contractLane).toHaveTextContent('Sans prépa · × 1')
    expect(screen.getByRole('region', { name: "Heures d'absences" })).toHaveTextContent('Absence préparée')
    expect(screen.getByRole('region', { name: 'À définir' })).toHaveTextContent('Coefficient manquant')
  })

  it('requires a valid login email before enabling a resource', async () => {
    render(<ConfigurationPage />)
    const toggle = await screen.findByRole('checkbox')
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }))

    expect(await screen.findByText('Ajoutez un e-mail de connexion valide pour (CDII)-Alice Martin.')).toBeInTheDocument()
    expect(saveResources).not.toHaveBeenCalled()
  })

  it('saves the selected resource with its normalized login field', async () => {
    render(<ConfigurationPage />)
    fireEvent.click(await screen.findByRole('checkbox'))
    fireEvent.change(screen.getByRole('textbox', { name: 'E-mail de connexion de (CDII)-Alice Martin' }), {
      target: { value: 'alice@example.fr' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }))

    await waitFor(() => expect(saveResources).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'employee-1', enabled: true, loginEmail: 'alice@example.fr' }),
    ]))
  })

  it('moves a card through preparation and hour type before saving', async () => {
    render(<ConfigurationPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Cours du mardi, préparation à définir/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer Cours du mardi vers Avec prépa' }))

    expect(screen.getByRole('region', { name: 'Avec prépa' })).toHaveTextContent('Cours du mardi')
    expect(screen.getByRole('button', { name: /Cours du mardi, avec préparation/ })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Enregistrer les règles' })).toBeDisabled()
    expect(screen.getByText('Terminez le classement des cartes déplacées.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Déplacer Cours du mardi vers Heures du contrat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les règles' }))

    await waitFor(() => expect(saveCoefficientCalendars).toHaveBeenCalledWith([
      expect.objectContaining({ googleCalendarId: usedCalendar.googleCalendarId, coefficient: 1.25, hourCategory: 'contract' }),
    ]))
  })

  it('saves one completed resource even when another followed resource is still incomplete', async () => {
    getResources.mockResolvedValue([
      resourceWith({ id: 'first', name: '(CDII)-Alice', enabled: true, loginEmail: 'alice@example.fr', annualContractHours: null }),
      resourceWith({ id: 'second', name: '(CDI)-Camille', enabled: true, loginEmail: 'camille@example.fr', annualContractHours: null }),
    ])
    render(<ConfigurationPage />)

    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Heures annuelles de (CDII)-Alice' }), {
      target: { value: '820' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }))

    await waitFor(() => expect(saveResources).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'first', annualContractHours: 820 }),
    ]))
    expect(saveResources).not.toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'second' }),
    ]))
  })

  it('shows a precise save failure next to the resource save button', async () => {
    saveResources.mockRejectedValueOnce(new Error('Cette adresse appartient déjà à un compte administrateur.'))
    render(<ConfigurationPage />)
    fireEvent.click(await screen.findByRole('checkbox'))
    fireEvent.change(screen.getByRole('textbox', { name: 'E-mail de connexion de (CDII)-Alice Martin' }), {
      target: { value: 'admin@example.fr' },
    })
    const saveButton = screen.getByRole('button', { name: 'Enregistrer les modifications' })
    const footer = saveButton.closest('.configuration-footer')
    fireEvent.click(saveButton)

    await waitFor(() => expect(footer).toHaveTextContent('Cette adresse appartient déjà à un compte administrateur.'))
  })

  it('supports native drag and drop through the two Kanban stages', async () => {
    render(<ConfigurationPage />)
    const values = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? '',
    }
    const card = await screen.findByRole('button', { name: /Cours du mardi, préparation à définir/ })
    const prepLane = screen.getByRole('region', { name: 'Sans prépa' })
    fireEvent.dragStart(card, { dataTransfer })
    fireEvent.dragOver(prepLane, { dataTransfer })
    fireEvent.drop(prepLane, { dataTransfer })

    expect(prepLane).toHaveTextContent('Cours du mardi')
    const replacementLane = screen.getByRole('region', { name: 'Heures de remplacements' })
    fireEvent.dragOver(replacementLane, { dataTransfer })
    fireEvent.drop(replacementLane, { dataTransfer })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les règles' }))

    await waitFor(() => expect(saveCoefficientCalendars).toHaveBeenCalledWith([
      expect.objectContaining({ googleCalendarId: usedCalendar.googleCalendarId, coefficient: 1, hourCategory: 'replacement' }),
    ]))
  })

  it('resets the hour type when a complete card changes preparation', async () => {
    getCoefficientCalendars.mockResolvedValue([{ ...usedCalendar, coefficient: 1.25, hourCategory: 'contract' }])
    render(<ConfigurationPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Cours du mardi, avec préparation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer Cours du mardi vers Sans prépa' }))

    expect(screen.getByRole('region', { name: 'Sans prépa' })).toHaveTextContent('Cours du mardi')
    expect(screen.getByRole('region', { name: 'Heures du contrat' })).not.toHaveTextContent('Cours du mardi')
    expect(screen.getByRole('button', { name: 'Enregistrer les règles' })).toBeDisabled()
    expect(saveCoefficientCalendars).not.toHaveBeenCalled()
  })

  it('can return a complete card to the undefined starting lane', async () => {
    getCoefficientCalendars.mockResolvedValue([{ ...usedCalendar, coefficient: 1, hourCategory: 'absence' }])
    render(<ConfigurationPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Cours du mardi, sans préparation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer Cours du mardi vers À définir' }))

    expect(screen.getByRole('region', { name: 'À définir' })).toHaveTextContent('Cours du mardi')
    expect(screen.getByRole('button', { name: 'Enregistrer les règles' })).toBeDisabled()
    expect(saveCoefficientCalendars).not.toHaveBeenCalled()
  })
})
