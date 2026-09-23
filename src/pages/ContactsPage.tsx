import { useEffect, useMemo, useState } from 'react'
import { ContactRound, Pencil, Phone, Plus, Save, Smartphone, Trash2, X } from 'lucide-react'
import { createReplacementContact, deleteReplacementContact, getReplacementContacts, updateReplacementContact } from '../services/api'
import type { ReplacementContact, ReplacementContactInput } from '../types'

type PhoneContact = { name?: string[]; email?: string[]; tel?: string[] }
type ContactsManager = {
  getProperties(): Promise<string[]>
  select(properties: string[], options: { multiple: boolean }): Promise<PhoneContact[]>
}

const emptyDraft: ReplacementContactInput = { lastName: '', firstName: '', email: '', phone: '' }

function splitName(value: string): Pick<ReplacementContactInput, 'firstName' | 'lastName'> {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return { firstName: parts[0] ?? '', lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

export function ContactsPage() {
  const [contacts, setContacts] = useState<ReplacementContact[]>([])
  const [draft, setDraft] = useState<ReplacementContactInput>(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const phonePicker = (navigator as Navigator & { contacts?: ContactsManager }).contacts
  const canPickPhoneContact = Boolean(phonePicker && window.isSecureContext)
  const isValid = useMemo(() => Object.values(draft).every((value) => value.trim().length > 0) && /\S+@\S+\.\S+/.test(draft.email), [draft])

  useEffect(() => {
    let cancelled = false
    void getReplacementContacts().then((items) => { if (!cancelled) setContacts(items) })
      .catch(() => { if (!cancelled) setError('Les contacts n’ont pas pu être chargés.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const resetForm = () => { setDraft(emptyDraft); setEditingId(null); setError('') }
  const edit = (contact: ReplacementContact) => {
    setEditingId(contact.id)
    setDraft({ lastName: contact.lastName, firstName: contact.firstName, email: contact.email, phone: contact.phone })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const pickFromPhone = async () => {
    if (!phonePicker) return
    setError('')
    try {
      const supported = await phonePicker.getProperties()
      const properties = ['name', 'email', 'tel'].filter((property) => supported.includes(property))
      const [contact] = await phonePicker.select(properties, { multiple: false })
      if (!contact) return
      const name = splitName(contact.name?.[0] ?? '')
      setDraft({ ...name, email: contact.email?.[0] ?? '', phone: contact.tel?.[0] ?? '' })
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setError('Le contact du téléphone n’a pas pu être importé. Vous pouvez le saisir manuellement.')
    }
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!isValid) return
    setSaving(true); setError('')
    try {
      const saved = editingId
        ? await updateReplacementContact(editingId, draft)
        : await createReplacementContact(draft)
      setContacts((current) => [...current.filter((contact) => contact.id !== saved.id), saved]
        .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fr')))
      resetForm()
    } catch { setError('L’enregistrement a échoué. Vérifiez les informations puis réessayez.') }
    finally { setSaving(false) }
  }

  const remove = async (contact: ReplacementContact) => {
    if (deletingId) return
    if (!window.confirm(`Supprimer ${contact.firstName} ${contact.lastName} de l’annuaire ?`)) return
    setError('')
    setDeletingId(contact.id)
    try {
      await deleteReplacementContact(contact.id)
      setContacts((current) => current.filter((item) => item.id !== contact.id))
      if (editingId === contact.id) resetForm()
    } catch { setError('La suppression a échoué. Réessayez.') }
    finally { setDeletingId(null) }
  }

  return <div className="page contacts-page">
    <header className="page-heading">
      <div><p className="eyebrow">Administration · Remplacements</p><h1>Contacts</h1><p>Conservez les coordonnées des moniteurs externes disponibles pour des remplacements.</p></div>
      {canPickPhoneContact && <button className="button button--secondary" type="button" onClick={() => void pickFromPhone()}><Smartphone aria-hidden="true" />Importer du téléphone</button>}
    </header>

    {error && <div className="alert alert--error contacts-alert" role="alert">{error}</div>}
    <section className="panel contacts-editor" aria-labelledby="contact-form-title">
      <div className="panel-heading"><div><p className="eyebrow">Annuaire</p><h2 id="contact-form-title">{editingId ? 'Modifier le contact' : 'Ajouter un contact'}</h2></div>{editingId && <button className="button button--secondary" type="button" onClick={resetForm}><X aria-hidden="true" />Annuler</button>}</div>
      <form className="contact-form" onSubmit={(event) => void save(event)}>
        <label><span>Nom</span><input required autoComplete="family-name" value={draft.lastName} onChange={(event) => setDraft({ ...draft, lastName: event.target.value })} /></label>
        <label><span>Prénom</span><input required autoComplete="given-name" value={draft.firstName} onChange={(event) => setDraft({ ...draft, firstName: event.target.value })} /></label>
        <label><span>E-mail</span><input required type="email" inputMode="email" autoComplete="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
        <label><span>Téléphone</span><input required type="tel" inputMode="tel" autoComplete="tel" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
        <button className="button button--primary" type="submit" disabled={!isValid || saving}>{editingId ? <Save aria-hidden="true" /> : <Plus aria-hidden="true" />}{saving ? 'Enregistrement…' : editingId ? 'Enregistrer' : 'Ajouter'}</button>
      </form>
      {!canPickPhoneContact && <p className="contact-picker-note"><Smartphone aria-hidden="true" />L’import depuis le carnet du téléphone apparaît automatiquement sur les navigateurs mobiles compatibles.</p>}
    </section>

    <section className="contacts-directory" aria-labelledby="contacts-list-title">
      <div className="contacts-directory__heading"><div><p className="eyebrow">Moniteurs remplaçants</p><h2 id="contacts-list-title">{contacts.length} contact{contacts.length > 1 ? 's' : ''}</h2></div></div>
      {loading ? <div className="empty-state"><span className="spinner" />Chargement de l’annuaire…</div> : contacts.length === 0 ? <div className="empty-state"><ContactRound aria-hidden="true" /><strong>Aucun contact</strong><span>Ajoutez votre premier moniteur remplaçant avec le formulaire.</span></div> : <div className="contact-grid">{contacts.map((contact) => <article className="contact-card" key={contact.id}>
        <div className="contact-card__avatar" aria-hidden="true">{contact.firstName.charAt(0)}{contact.lastName.charAt(0)}</div>
        <div className="contact-card__identity"><h3>{contact.firstName} {contact.lastName}</h3><a href={`mailto:${contact.email}`}>{contact.email}</a><a href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}><Phone aria-hidden="true" />{contact.phone}</a></div>
        <div className="contact-card__actions"><button type="button" onClick={() => edit(contact)} aria-label={`Modifier ${contact.firstName} ${contact.lastName}`} disabled={deletingId === contact.id}><Pencil aria-hidden="true" /></button><button type="button" onClick={() => void remove(contact)} aria-label={`Supprimer ${contact.firstName} ${contact.lastName}`} disabled={deletingId === contact.id}><Trash2 aria-hidden="true" /></button></div>
      </article>)}</div>}
    </section>
  </div>
}
