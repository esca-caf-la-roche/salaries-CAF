import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

let role: 'admin' | 'employee' = 'admin'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', role, displayName: 'Utilisateur', email: 'user@example.fr' },
    requestOtp: vi.fn(), verifyOtp: vi.fn(), signInDemo: vi.fn(), isDemo: false,
  }),
}))

describe('LoginPage redirect', () => {
  afterEach(cleanup)

  it('sends an administrator to the overview after login', async () => {
    role = 'admin'
    render(<MemoryRouter initialEntries={['/connexion']}><Routes><Route path="/connexion" element={<LoginPage />} /><Route path="/vue-ensemble" element={<h1>Vue d’ensemble</h1>} /></Routes></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Vue d’ensemble' })).toBeInTheDocument()
  })

  it('keeps an employee on personal time tracking after login', async () => {
    role = 'employee'
    render(<MemoryRouter initialEntries={['/connexion']}><Routes><Route path="/connexion" element={<LoginPage />} /><Route path="/" element={<h1>Suivi personnel</h1>} /></Routes></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Suivi personnel' })).toBeInTheDocument()
  })
})
