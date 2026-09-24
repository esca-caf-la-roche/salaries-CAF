import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

let currentUser = { id: 'employee-1', role: 'employee', displayName: 'Salarié', email: 'employee@example.fr' }

vi.mock('./context/AuthContext', () => ({
  useAuth: () => ({ user: currentUser, loading: false, isDemo: false, signOut: vi.fn() }),
}))
vi.mock('./pages/TimeTrackingPage', () => ({ TimeTrackingPage: () => <h1>Suivi personnel</h1> }))
vi.mock('./pages/TimeConversionPage', () => ({ TimeConversionPage: () => <h1>Conversion des heures</h1> }))
vi.mock('./pages/DashboardPage', () => ({ DashboardPage: () => <h1>Vue admin</h1> }))
vi.mock('./pages/ReplacementAbsencePage', () => ({ ReplacementAbsencePage: () => <h1>Absences admin</h1> }))
vi.mock('./pages/ConfigurationPage', () => ({ ConfigurationPage: () => null }))
vi.mock('./pages/IndependentEventsPage', () => ({ IndependentEventsPage: () => null }))
vi.mock('./pages/UnassignedEventsPage', () => ({ UnassignedEventsPage: () => null }))
vi.mock('./pages/PayrollEntryPage', () => ({ PayrollEntryPage: () => <h1>Bulletins admin</h1> }))
vi.mock('./pages/ContactsPage', () => ({ ContactsPage: () => <h1>Contacts admin</h1> }))
vi.mock('./pages/LoginPage', () => ({ LoginPage: () => null }))

describe('role-based routes', () => {
  afterEach(cleanup)

  it('opens the overview from the home URL for an administrator', async () => {
    currentUser = { id: 'admin-1', role: 'admin', displayName: 'Admin', email: 'admin@example.fr' }
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Vue admin' })).toBeInTheDocument()
  })

  it('opens personal time tracking from the home URL for an employee', async () => {
    currentUser = { id: 'employee-1', role: 'employee', displayName: 'Salarié', email: 'employee@example.fr' }
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Suivi personnel' })).toBeInTheDocument()
  })

  it('keeps time tracking available to an administrator on its dedicated URL', async () => {
    currentUser = { id: 'admin-1', role: 'admin', displayName: 'Admin', email: 'admin@example.fr' }
    render(<MemoryRouter initialEntries={['/suivi-heures']}><App /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Suivi personnel' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Suivi des heures' })).toHaveAttribute('href', '/suivi-heures')
  })

  it('redirects an employee away from the overview and hides its navigation entry', async () => {
    currentUser = { id: 'employee-1', role: 'employee', displayName: 'Salarié', email: 'employee@example.fr' }
    render(<MemoryRouter initialEntries={['/vue-ensemble']}><App /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Suivi personnel' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: "Vue d'ensemble" })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Absences & remplacements' })).not.toBeInTheDocument()
  })

  it('keeps the overview available to an administrator', async () => {
    currentUser = { id: 'admin-1', role: 'admin', displayName: 'Admin', email: 'admin@example.fr' }
    render(<MemoryRouter initialEntries={['/vue-ensemble']}><App /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Vue admin' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: "Vue d'ensemble" })).toBeInTheDocument()
  })

  it('keeps the replacement and absence report restricted to administrators', async () => {
    currentUser = { id: 'employee-1', role: 'employee', displayName: 'Salarié', email: 'employee@example.fr' }
    render(<MemoryRouter initialEntries={['/absences-remplacements']}><App /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Suivi personnel' })).toBeInTheDocument()
  })

  it('restricts the payslip entry page to administrators', async () => {
    currentUser = { id: 'employee-1', role: 'employee', displayName: 'Salarié', email: 'employee@example.fr' }
    render(<MemoryRouter initialEntries={['/bulletins']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Suivi personnel' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Bulletins' })).not.toBeInTheDocument()
  })

  it('restricts the replacement directory to administrators', async () => {
    currentUser = { id: 'employee-1', role: 'employee', displayName: 'Salarié', email: 'employee@example.fr' }
    render(<MemoryRouter initialEntries={['/contacts']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Suivi personnel' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Contacts' })).not.toBeInTheDocument()
  })

  it('makes conversion available to every authenticated role', async () => {
    currentUser = { id: 'employee-1', role: 'employee', displayName: 'Salarié', email: 'employee@example.fr' }
    render(<MemoryRouter initialEntries={['/conversion']}><App /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Conversion des heures' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Conversion' })).toHaveLength(2)
  })

  it('orders the administrator sidebar from overview to configuration', async () => {
    currentUser = { id: 'admin-1', role: 'admin', displayName: 'Admin', email: 'admin@example.fr' }
    render(<MemoryRouter initialEntries={['/vue-ensemble']}><App /></MemoryRouter>)

    await screen.findByRole('heading', { name: 'Vue admin' })
    const navigation = screen.getByRole('navigation', { name: 'Navigation principale' })
    expect(within(navigation).getAllByRole('link').map((link) => link.textContent?.trim())).toEqual([
      "Vue d'ensemble", 'Suivi des heures', 'Absences & remplacements', 'Bulletins', 'Gérer les remplacements', 'À déterminer', 'Contacts', 'Indépendants', 'Conversion', 'Configuration',
    ])
  })
})
