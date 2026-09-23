import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContactsPage } from './ContactsPage'

const getReplacementContacts = vi.fn()
const createReplacementContact = vi.fn()
const updateReplacementContact = vi.fn()
const deleteReplacementContact = vi.fn()

vi.mock('../services/api', () => ({
  getReplacementContacts: (...args: unknown[]) => getReplacementContacts(...args),
  createReplacementContact: (...args: unknown[]) => createReplacementContact(...args),
  updateReplacementContact: (...args: unknown[]) => updateReplacementContact(...args),
  deleteReplacementContact: (...args: unknown[]) => deleteReplacementContact(...args),
}))

const alice = { id: 'contact-1', firstName: 'Alice', lastName: 'Martin', email: 'alice@example.fr', phone: '06 01 02 03 04', createdAt: '2026-09-23', updatedAt: '2026-09-23' }

describe('ContactsPage', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.clearAllMocks()
    getReplacementContacts.mockResolvedValue([alice])
    createReplacementContact.mockImplementation(async (input) => ({ ...input, id: 'contact-2', createdAt: '2026-09-23', updatedAt: '2026-09-23' }))
    updateReplacementContact.mockImplementation(async (id, input) => ({ ...input, id, createdAt: '2026-09-23', updatedAt: '2026-09-24' }))
    deleteReplacementContact.mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    Object.defineProperty(navigator, 'contacts', { configurable: true, value: undefined })
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
  })

  it('loads contacts and adds a valid contact', async () => {
    render(<ContactsPage />)
    expect(await screen.findByRole('heading', { name: 'Alice Martin' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Durand' } })
    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Benoît' } })
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'benoit@example.fr' } })
    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '06 10 20 30 40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(createReplacementContact).toHaveBeenCalledWith({ lastName: 'Durand', firstName: 'Benoît', email: 'benoit@example.fr', phone: '06 10 20 30 40' }))
    expect(await screen.findByRole('heading', { name: 'Benoît Durand' })).toBeInTheDocument()
  })

  it('edits and deletes an existing contact after confirmation', async () => {
    render(<ContactsPage />)
    await screen.findByRole('heading', { name: 'Alice Martin' })
    fireEvent.click(screen.getByRole('button', { name: 'Modifier Alice Martin' }))
    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '07 00 00 00 00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateReplacementContact).toHaveBeenCalledWith('contact-1', expect.objectContaining({ phone: '07 00 00 00 00' })))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer Alice Martin' }))
    await waitFor(() => expect(deleteReplacementContact).toHaveBeenCalledWith('contact-1'))
  })

  it('keeps the manual form usable when the phone picker is unavailable', async () => {
    render(<ContactsPage />)
    await screen.findByRole('heading', { name: 'Alice Martin' })
    expect(screen.queryByRole('button', { name: /Importer du téléphone/ })).not.toBeInTheDocument()
    expect(screen.getByText(/navigateurs mobiles compatibles/)).toBeInTheDocument()
  })

  it('imports a selected phone contact into the editable form without saving it', async () => {
    const select = vi.fn().mockResolvedValue([{ name: ['Benoît Durand'], email: ['benoit@example.fr'], tel: ['06 10 20 30 40'] }])
    Object.defineProperty(navigator, 'contacts', { configurable: true, value: { getProperties: vi.fn().mockResolvedValue(['name', 'email', 'tel']), select } })
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    render(<ContactsPage />)
    await screen.findByRole('heading', { name: 'Alice Martin' })
    fireEvent.click(screen.getByRole('button', { name: 'Importer du téléphone' }))
    await waitFor(() => expect(select).toHaveBeenCalledWith(['name', 'email', 'tel'], { multiple: false }))
    expect(screen.getByLabelText('Prénom')).toHaveValue('Benoît')
    expect(screen.getByLabelText('Nom')).toHaveValue('Durand')
    expect(screen.getByLabelText('E-mail')).toHaveValue('benoit@example.fr')
    expect(screen.getByLabelText('Téléphone')).toHaveValue('06 10 20 30 40')
    expect(createReplacementContact).not.toHaveBeenCalled()
  })
})
