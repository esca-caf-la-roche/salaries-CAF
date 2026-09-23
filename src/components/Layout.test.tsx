import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Layout } from './Layout'

type TestUser = { id: string; role: 'admin' | 'employee'; displayName: string; email: string }
let currentUser: TestUser = { id: 'admin-1', role: 'admin', displayName: 'Admin', email: 'admin@example.fr' }

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: currentUser, loading: false, isDemo: false, signOut: vi.fn() }),
}))

function renderLayout(initialEntry: string) {
  return render(<MemoryRouter initialEntries={[initialEntry]}><Layout /></MemoryRouter>)
}

describe('Layout mobile navigation', () => {
  afterEach(cleanup)

  beforeEach(() => {
    currentUser = { id: 'admin-1', role: 'admin', displayName: 'Admin', email: 'admin@example.fr' }
  })
  it('keeps the mobile bar to five items with the overflow behind a Plus button', () => {
    renderLayout('/vue-ensemble')
    const bar = screen.getByRole('navigation', { name: 'Navigation mobile' })
    expect(bar.querySelectorAll('a')).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Plus de navigation' })).toBeInTheDocument()
    for (const label of ['Vue', 'Suivi', 'Remplacer', 'Indép.']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('opens the overflow sheet and closes it after navigating', async () => {
    renderLayout('/vue-ensemble')
    fireEvent.click(screen.getByRole('button', { name: 'Plus de navigation' }))
    const sheet = screen.getByRole('menu', { name: 'Autres pages' })
    expect(sheet.querySelectorAll('a')).toHaveLength(5)
    expect(within(sheet).getByText('Absences & remplacements')).toBeInTheDocument()
    expect(within(sheet).getByText('Ressources')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByText('À déterminer'))
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Autres pages' })).not.toBeInTheDocument())
  })

  it('closes the overflow sheet on Escape', () => {
    renderLayout('/vue-ensemble')
    fireEvent.click(screen.getByRole('button', { name: 'Plus de navigation' }))
    expect(screen.getByRole('menu', { name: 'Autres pages' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Autres pages' })).not.toBeInTheDocument()
  })

  it('marks the Plus button active when a secondary page is displayed', () => {
    renderLayout('/configuration')
    expect(screen.getByRole('button', { name: 'Plus de navigation' }).className).toContain('active')
  })

  it('shows the two employee links without a Plus button', () => {
    currentUser = { id: 'employee-1', role: 'employee', displayName: 'Salarié', email: 'employee@example.fr' }
    renderLayout('/')
    const bar = screen.getByRole('navigation', { name: 'Navigation mobile' })
    expect(bar.querySelectorAll('a')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Plus de navigation' })).not.toBeInTheDocument()
  })
})
