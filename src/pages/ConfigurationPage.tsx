import { useEffect, useMemo, useState } from 'react'
import { Check, CircleAlert, Mail, RefreshCw, Search } from 'lucide-react'
import { discoverResources, getCoefficientCalendars, getResources, saveCoefficientCalendars, saveResources, startGoogleConnection } from '../services/api'
import type { EmployeeResource, PreparationCoefficient, UsedCalendarCoefficient } from '../types'

export function ConfigurationPage() {
  const [resources, setResources] = useState<EmployeeResource[]>([])
  const [coefficientCalendars, setCoefficientCalendars] = useState<UsedCalendarCoefficient[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [coefficientsLoading, setCoefficientsLoading] = useState(true)
  const [coefficientsRefreshing, setCoefficientsRefreshing] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [dirty, setDirty] = useState(new Set<string>())
  const [coefficientDirty, setCoefficientDirty] = useState(new Set<string>())
  const [saving, setSaving] = useState(false)
  const [coefficientsSaving, setCoefficientsSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { void getResources().then(setResources).catch(() => setMessage('Les ressources n\'ont pas pu être chargées.')).finally(() => setLoading(false)) }, [])
  useEffect(() => { void getCoefficientCalendars().then(setCoefficientCalendars).catch(() => setMessage('Les calendriers utilisés n\'ont pas pu être chargés.')).finally(() => setCoefficientsLoading(false)) }, [])
  const filtered = useMemo(() => {
    const normalizedQuery = query.toLocaleLowerCase('fr')
    return resources.filter((resource) => `${resource.name} ${resource.googleCalendarId} ${resource.loginEmail}`.toLocaleLowerCase('fr').includes(normalizedQuery))
  }, [resources, query])
  const enabledCount = resources.filter((resource) => resource.enabled).length

  const patchResource = (id: string, patch: Partial<EmployeeResource>) => {
    setResources((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item))
    setDirty((items) => new Set(items).add(id))
    setMessage('')
  }
  const detect = async () => {
    setDiscovering(true)
    setMessage('')
    try { setResources(await discoverResources()); setDirty(new Set()); setMessage('Liste des ressources salariées actualisée.') }
    catch { setMessage('La détection a échoué. Reconnectez le compte Google puis réessayez.') }
    finally { setDiscovering(false) }
  }
  const patchCoefficient = (googleCalendarId: string, coefficient: PreparationCoefficient) => {
    setCoefficientCalendars((items) => items.map((item) => item.googleCalendarId === googleCalendarId ? { ...item, coefficient } : item))
    setCoefficientDirty((items) => new Set(items).add(googleCalendarId))
    setMessage('')
  }
  const connectGoogle = async () => {
    setConnecting(true)
    setMessage('')
    try { await startGoogleConnection() }
    catch { setMessage('La connexion Google n\'a pas pu démarrer.') }
    finally { setConnecting(false) }
  }
  const refreshCoefficients = async () => {
    setCoefficientsRefreshing(true)
    setMessage('')
    try {
      setCoefficientCalendars(await getCoefficientCalendars())
      setCoefficientDirty(new Set())
      setMessage('Calendriers utilisés actualisés.')
    } catch { setMessage('La détection des calendriers utilisés a échoué.') }
    finally { setCoefficientsRefreshing(false) }
  }
  const save = async () => {
    const invalid = resources.find((resource) => resource.enabled && !/^\S+@\S+\.\S+$/.test(resource.loginEmail.trim()))
    if (invalid) { setMessage(`Ajoutez un e-mail de connexion valide pour ${invalid.name}.`); return }
    setSaving(true)
    setMessage('')
    try {
      const changed = resources.filter((resource) => dirty.has(resource.id))
      setResources(await saveResources(changed))
      setDirty(new Set())
      setMessage('Configuration enregistrée. Les salariés sélectionnés peuvent recevoir un code de connexion.')
    } catch { setMessage('Les modifications n\'ont pas pu être enregistrées.') }
    finally { setSaving(false) }
  }
  const saveCoefficients = async () => {
    const changed = coefficientCalendars.filter((calendar) => coefficientDirty.has(calendar.googleCalendarId))
    if (changed.some((calendar) => calendar.coefficient == null)) {
      setMessage('Choisissez un coefficient pour chaque calendrier modifié.')
      return
    }
    setCoefficientsSaving(true)
    setMessage('')
    try {
      setCoefficientCalendars(await saveCoefficientCalendars(changed))
      setCoefficientDirty(new Set())
      setMessage('Coefficients enregistrés. Les heures pondérées sont à jour.')
    } catch { setMessage('Les coefficients n\'ont pas pu être enregistrés.') }
    finally { setCoefficientsSaving(false) }
  }

  return (
    <div className="page">
      <header className="page-heading">
        <div><p className="eyebrow">Paramétrage</p><h1>Ressources et coefficients</h1><p>Choisissez les ressources salariées, puis indiquez si chaque calendrier utilisé comprend du temps de préparation.</p></div>
        <div className="page-actions">
          <button className="button button--secondary" type="button" onClick={() => void connectGoogle()} disabled={connecting}>
            {connecting ? 'Connexion…' : 'Connecter Google'}
          </button>
          <button className="button button--secondary" type="button" onClick={() => void detect()} disabled={discovering}>
            <RefreshCw className={discovering ? 'spin' : ''} aria-hidden="true" /> {discovering ? 'Détection…' : 'Détecter les ressources'}
          </button>
        </div>
      </header>
      {message && <div className="alert alert--success" role="status">{message}</div>}
      <section className="setup-note">
        <span><CircleAlert aria-hidden="true" /></span>
        <div><strong>Comment fonctionne le calcul ?</strong><p>Chaque ressource regroupe ses événements. Le calendrier d'origine de chaque événement détermine ensuite le coefficient : sans préparation ×1, avec préparation ×1,25.</p></div>
        <code>ressource → calendrier → coef.</code>
      </section>
      <section className="panel configuration-panel">
        <div className="configuration-toolbar">
          <div><p className="eyebrow">Calendriers ressources Google</p><h2>{enabledCount} ressource{enabledCount > 1 ? 's' : ''} suivie{enabledCount > 1 ? 's' : ''}</h2></div>
          <label className="search-field"><Search aria-hidden="true" /><span className="sr-only">Rechercher une ressource</span><input type="search" placeholder="Rechercher…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        </div>
        <div className="calendar-head" aria-hidden="true"><span>Ressource</span><span>Suivi</span><span>E-mail de connexion</span></div>
        {loading ? <div className="skeleton-list" aria-label="Chargement des ressources"><i /><i /><i /></div> : (
          <div className="calendar-list">
            {filtered.map((resource) => <article className={resource.enabled ? 'calendar-row calendar-row--enabled' : 'calendar-row'} key={resource.id}>
              <div className="calendar-identity"><i style={{ background: resource.color }} /><span><strong>{resource.name}</strong><small>{resource.eventCount ?? 0} événements · {resource.googleCalendarId}</small></span></div>
              <label className="switch"><input type="checkbox" checked={resource.enabled} onChange={(event) => patchResource(resource.id, { enabled: event.target.checked })} /><span aria-hidden="true" /><em>{resource.enabled ? 'Suivie' : 'Ignorée'}</em></label>
              <label className="email-input"><span className="sr-only">E-mail de connexion de {resource.name}</span><Mail aria-hidden="true" /><input type="email" placeholder="prenom@exemple.fr" value={resource.loginEmail} disabled={!resource.enabled} required={resource.enabled} onChange={(event) => patchResource(resource.id, { loginEmail: event.target.value })} /></label>
            </article>)}
            {!filtered.length && <div className="empty-state"><Search aria-hidden="true" /><strong>Aucune ressource trouvée</strong><span>Modifiez votre recherche ou relancez la détection Google.</span></div>}
          </div>
        )}
        <footer className="configuration-footer"><span>{dirty.size ? `${dirty.size} modification${dirty.size > 1 ? 's' : ''} non enregistrée${dirty.size > 1 ? 's' : ''}` : <><Check aria-hidden="true" /> Configuration à jour</>}</span><button className="button button--primary" type="button" onClick={() => void save()} disabled={!dirty.size || saving}>{saving ? 'Enregistrement…' : 'Enregistrer les modifications'}</button></footer>
      </section>
      <section className="panel configuration-panel coefficient-panel">
        <div className="configuration-toolbar">
          <div><p className="eyebrow">Calendriers utilisés</p><h2>{coefficientCalendars.length} calendrier{coefficientCalendars.length > 1 ? 's' : ''} détecté{coefficientCalendars.length > 1 ? 's' : ''}</h2></div>
          <button className="button button--secondary" type="button" onClick={() => void refreshCoefficients()} disabled={coefficientsRefreshing}>
            <RefreshCw className={coefficientsRefreshing ? 'spin' : ''} aria-hidden="true" /> {coefficientsRefreshing ? 'Actualisation…' : 'Actualiser les calendriers utilisés'}
          </button>
        </div>
        <div className="coefficient-head" aria-hidden="true"><span>Calendrier d'origine</span><span>Coefficient</span></div>
        {coefficientsLoading ? <div className="skeleton-list" aria-label="Chargement des calendriers utilisés"><i /><i /></div> : (
          <div className="calendar-list">
            {coefficientCalendars.map((calendar) => <article className="coefficient-row" key={calendar.googleCalendarId}>
              <div className="calendar-identity"><i /><span><strong>{calendar.name}</strong><small>{calendar.eventCount} événement{calendar.eventCount > 1 ? 's' : ''} · {calendar.googleCalendarId}</small></span></div>
              <label className="coefficient-select">
                <span className="sr-only">Coefficient de {calendar.name}</span>
                <select value={calendar.coefficient ?? ''} onChange={(event) => patchCoefficient(calendar.googleCalendarId, Number(event.target.value) as PreparationCoefficient)}>
                  <option value="" disabled>Choisir…</option>
                  <option value="1">Sans prépa · ×1</option>
                  <option value="1.25">Avec prépa · ×1,25</option>
                </select>
              </label>
            </article>)}
            {!coefficientCalendars.length && <div className="empty-state"><Search aria-hidden="true" /><strong>Aucun calendrier utilisé détecté</strong><span>Activez une ressource puis lancez une synchronisation pour analyser ses événements.</span></div>}
          </div>
        )}
        <footer className="configuration-footer"><span>{coefficientDirty.size ? `${coefficientDirty.size} coefficient${coefficientDirty.size > 1 ? 's' : ''} non enregistré${coefficientDirty.size > 1 ? 's' : ''}` : <><Check aria-hidden="true" /> Coefficients à jour</>}</span><button className="button button--primary" type="button" onClick={() => void saveCoefficients()} disabled={!coefficientDirty.size || coefficientsSaving}>{coefficientsSaving ? 'Enregistrement…' : 'Enregistrer les coefficients'}</button></footer>
      </section>
    </div>
  )
}
