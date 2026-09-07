import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

let currentUser = { id: 'employee-1', role: 'employee', displayName: 'Salarié', email: 'employee@example.fr' }

vi.mock('./context/AuthContext', () => ({
  useAuth: () => ({ user: currentUser, loading: false, isDemo: false, signOut: vi.fn() }),
}))
vi.mock('./pages/TimeTrackingPage', () => ({ TimeTrackingPage: () => <h1>Suivi personnel</h1> }))
vi.mock('./pages/DashboardPage', () => ({ DashboardPage: () => <h1>Vue admin</h1> }))
vi.mock('./pages/ConfigurationPage', () => ({ ConfigurationPage: () => null }))
vi.mock('./pages/IndependentEventsPage', () => ({ IndependentEventsPage: () => null }))
vi.mock('./pages/UnassignedEventsPage', () => ({ UnassignedEventsPage: () => null }))
vi.mock('./pages/LoginPage', () => ({ LoginPage: () => null }))

describe('role-based routes', () => {
  afterEach(cleanup)

  it('redirects an employee away from the overview and hides its navigation entry', async () => {
    currentUser = { id: 'employee-1', role: 'employee', displayName: 'Salarié', email: 'employee@example.fr' }
    render(<MemoryRouter initialEntries={['/vue-ensemble']}><App /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Suivi personnel' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: "Vue d'ensemble" })).not.toBeInTheDocument()
  })

  it('keeps the overview available to an administrator', async () => {
    currentUser = { id: 'admin-1', role: 'admin', displayName: 'Admin', email: 'admin@example.fr' }
    render(<MemoryRouter initialEntries={['/vue-ensemble']}><App /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Vue admin' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: "Vue d'ensemble" })).toBeInTheDocument()
  })

  it('orders the administrator sidebar from overview to configuration', async () => {
    currentUser = { id: 'admin-1', role: 'admin', displayName: 'Admin', email: 'admin@example.fr' }
    render(<MemoryRouter initialEntries={['/vue-ensemble']}><App /></MemoryRouter>)

    await screen.findByRole('heading', { name: 'Vue admin' })
    const navigation = screen.getByRole('navigation', { name: 'Navigation principale' })
    expect(within(navigation).getAllByRole('link').map((link) => link.textContent?.trim())).toEqual([
      "Vue d'ensemble", 'Suivi des heures', 'Indépendants', 'À déterminer', 'Configuration',
    ])
  })
})
