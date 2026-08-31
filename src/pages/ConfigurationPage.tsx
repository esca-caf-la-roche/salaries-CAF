import { useEffect, useMemo, useState } from 'react'
import { Check, CircleAlert, RefreshCw, Search, SlidersHorizontal } from 'lucide-react'
import { discoverCalendars, getCalendars, startGoogleConnection, updateCalendar } from '../services/api'
import type { CalendarResource } from '../types'

export function ConfigurationPage() {
  const [calendars, setCalendars] = useState<CalendarResource[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [dirty, setDirty] = useState(new Set<string>())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { void getCalendars().then(setCalendars).finally(() => setLoading(false)) }, [])
  const filtered = useMemo(() => calendars.filter((calendar) => calendar.name.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr'))), [calendars, query])
  const enabledCount = calendars.filter((calendar) => calendar.enabled).length

  const patchCalendar = (id: string, patch: Partial<CalendarResource>) => {
    setCalendars((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item))
    setDirty((items) => new Set(items).add(id))
    setMessage('')
  }
  const detect = async () => {
    setDiscovering(true)
    setMessage('')
    try { setCalendars(await discoverCalendars()); setMessage('Liste des calendriers actualisée.') }
    catch { setMessage('La détection a échoué. Reconnectez le compte Google puis réessayez.') }
    finally { setDiscovering(false) }
  }
  const connectGoogle = async () => {
    setConnecting(true)
    setMessage('')
    try { await startGoogleConnection() }
    catch { setMessage('La connexion Google n\'a pas pu démarrer.') }
    finally { setConnecting(false) }
  }
  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      await Promise.all(calendars.filter((calendar) => dirty.has(calendar.id)).map(updateCalendar))
      setDirty(new Set())
      setMessage('Configuration enregistrée. La prochaine synchronisation appliquera ces coefficients.')
    } catch { setMessage('Les modifications n\'ont pas pu être enregistrées.') }
    finally { setSaving(false) }
  }

  return (
    <div className="page">
      <header className="page-heading">
        <div><p className="eyebrow">Paramétrage</p><h1>Calendriers & coefficients</h1><p>Choisissez les ressources à suivre et la pondération appliquée à leurs événements.</p></div>
        <div className="page-actions">
          <button className="button button--secondary" type="button" onClick={() => void connectGoogle()} disabled={connecting}>
            {connecting ? 'Connexion…' : 'Connecter Google'}
          </button>
          <button className="button button--secondary" type="button" onClick={() => void detect()} disabled={discovering}>
            <RefreshCw className={discovering ? 'spin' : ''} aria-hidden="true" /> {discovering ? 'Détection…' : 'Détecter les calendriers'}
          </button>
        </div>
      </header>
      {message && <div className="alert alert--success" role="status">{message}</div>}
      <section className="setup-note">
        <span><CircleAlert aria-hidden="true" /></span>
        <div><strong>Comment fonctionne le calcul ?</strong><p>Chaque durée d'événement est multipliée par le coefficient du calendrier. Seuls les calendriers activés sont synchronisés.</p></div>
        <code>durée × coef.</code>
      </section>
      <section className="panel configuration-panel">
        <div className="configuration-toolbar">
          <div><p className="eyebrow">Ressources Google</p><h2>{enabledCount} calendrier{enabledCount > 1 ? 's' : ''} suivi{enabledCount > 1 ? 's' : ''}</h2></div>
          <label className="search-field"><Search aria-hidden="true" /><span className="sr-only">Rechercher un calendrier</span><input type="search" placeholder="Rechercher…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        </div>
        <div className="calendar-head" aria-hidden="true"><span>Calendrier</span><span>Suivi</span><span>Coefficient</span></div>
        {loading ? <div className="skeleton-list" aria-label="Chargement des calendriers"><i /><i /><i /></div> : (
          <div className="calendar-list">
            {filtered.map((calendar) => <article className={calendar.enabled ? 'calendar-row calendar-row--enabled' : 'calendar-row'} key={calendar.id}>
              <div className="calendar-identity"><i style={{ background: calendar.color }} /><span><strong>{calendar.name}</strong><small>{calendar.eventCount ?? 0} événements détectés</small></span></div>
              <label className="switch"><input type="checkbox" checked={calendar.enabled} onChange={(event) => patchCalendar(calendar.id, { enabled: event.target.checked })} /><span aria-hidden="true" /><em>{calendar.enabled ? 'Activé' : 'Ignoré'}</em></label>
              <label className="coefficient-input"><span className="sr-only">Coefficient de {calendar.name}</span><SlidersHorizontal aria-hidden="true" /><input type="number" min="0" max="5" step="0.05" value={calendar.coefficient} disabled={!calendar.enabled} onChange={(event) => patchCalendar(calendar.id, { coefficient: Number(event.target.value) })} /><b>×</b></label>
            </article>)}
            {!filtered.length && <div className="empty-state"><Search aria-hidden="true" /><strong>Aucun calendrier trouvé</strong><span>Modifiez votre recherche ou relancez la détection Google.</span></div>}
          </div>
        )}
        <footer className="configuration-footer"><span>{dirty.size ? `${dirty.size} modification${dirty.size > 1 ? 's' : ''} non enregistrée${dirty.size > 1 ? 's' : ''}` : <><Check aria-hidden="true" /> Configuration à jour</>}</span><button className="button button--primary" type="button" onClick={() => void save()} disabled={!dirty.size || saving}>{saving ? 'Enregistrement…' : 'Enregistrer les modifications'}</button></footer>
      </section>
    </div>
  )
}
