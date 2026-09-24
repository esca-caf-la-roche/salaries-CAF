import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { getAvailableReplacementResources, getReplacementEvents, getResources, processReplacements } from '../services/api'
import type { EmployeeResource, ReplacementEvent, ReplacementResource } from '../types'

const dateTime = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })

export function ReplacementManagementPage() {
  const [step, setStep] = useState(1)
  const [resources, setResources] = useState<EmployeeResource[]>([])
  const [resourceId, setResourceId] = useState('')
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1) })
  const [events, setEvents] = useState<ReplacementEvent[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [available, setAvailable] = useState<Record<string, ReplacementResource[]>>({})
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [syncWarning, setSyncWarning] = useState('')
  const selectedEvents = useMemo(() => events.filter((event) => selectedIds.includes(event.id)), [events, selectedIds])

  useEffect(() => { void getResources().then((items) => setResources(items.filter((item) => item.enabled))).catch(() => setError('Les ressources n’ont pas pu être chargées.')).finally(() => setLoading(false)) }, [])
  useEffect(() => {
    if (step !== 2 || !resourceId) return
    let active = true
    setLoading(true); setError('')
    void getReplacementEvents(resourceId, month.getFullYear(), month.getMonth() + 1).then((items) => { if (active) setEvents(items) }).catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Les événements à remplacer n’ont pas pu être chargés.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [step, resourceId, month])

  const openAssignments = async () => {
    setLoading(true); setError('')
    try {
      const entries = await Promise.all(selectedEvents.map(async (event) => [event.id, await getAvailableReplacementResources(event.startsAt, event.endsAt)] as const))
      setAvailable(Object.fromEntries(entries)); setStep(3)
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Les ressources disponibles n’ont pas pu être chargées.') } finally { setLoading(false) }
  }
  const submit = async () => {
    if (selectedEvents.some((event) => !assignments[event.id])) return
    setLoading(true); setError(''); setSuccess(''); setSyncWarning('')
    try {
      const result = await processReplacements(resourceId, selectedEvents.map((event) => ({ eventId: event.id, replacementResourceId: assignments[event.id] })))
      if (result.hasFailures) setError(result.message)
      else setSuccess(result.message)
      setSyncWarning(result.syncWarning ?? '')
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Les remplacements n’ont pas pu être enregistrés.') } finally { setLoading(false) }
  }
  const reset = () => { setStep(1); setResourceId(''); setEvents([]); setSelectedIds([]); setAssignments({}); setSuccess(''); setSyncWarning('') }

  return <div className="page replacement-management-page">
    <header className="page-heading"><div><p className="eyebrow">Administration</p><h1>Gérer les remplacements</h1><p>Sélectionnez les cours concernés puis attribuez une ressource disponible.</p></div></header>
    <ol className="replacement-steps" aria-label="Progression"><li aria-current={step === 1 ? 'step' : undefined} className={step >= 1 ? 'is-active' : ''}>1 <span>Ressource</span></li><li aria-current={step === 2 ? 'step' : undefined} className={step >= 2 ? 'is-active' : ''}>2 <span>Événements</span></li><li aria-current={step === 3 ? 'step' : undefined} className={step >= 3 ? 'is-active' : ''}>3 <span>Attribution</span></li></ol>
    {error && <div className="alert alert--error" role="alert">{error}</div>}{success && <div className="alert alert--success" role="status"><Check aria-hidden="true" />{success}</div>}{syncWarning && <div className="alert alert--error" role="alert">{syncWarning}</div>}
    <section className="replacement-workflow" aria-busy={loading}>
      {step === 1 && <><h2>Qui doit être remplacé ?</h2><label className="replacement-field"><span>Ressource concernée</span><select value={resourceId} onChange={(event) => setResourceId(event.target.value)} disabled={loading}><option value="">Sélectionner une ressource</option>{resources.map((resource) => <option value={resource.googleCalendarId} key={resource.id}>{resource.name}</option>)}</select></label><p className="replacement-help">Les événements choisis seront déplacés vers le calendrier des absences. Le remplaçant recevra une copie dans le calendrier des remplacements.</p><div className="replacement-actions"><button className="button button--primary" disabled={!resourceId} onClick={() => setStep(2)}>Choisir les événements <ArrowRight aria-hidden="true" /></button></div></>}
      {step === 2 && <><div className="replacement-workflow__heading"><div><h2>Événements de {monthName.format(month)}</h2><p>{resources.find((resource) => resource.googleCalendarId === resourceId)?.name}</p></div><div className="replacement-month-nav"><button type="button" aria-label="Mois précédent" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></button><button type="button" aria-label="Mois suivant" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></button></div></div>{loading ? <div className="skeleton-list" aria-label="Chargement des événements"><i /><i /></div> : events.length === 0 ? <p className="overview-empty">Aucun événement pour ce mois.</p> : <ul className="replacement-event-list">{events.map((event) => <li key={event.id}><label><input type="checkbox" checked={selectedIds.includes(event.id)} onChange={(change) => setSelectedIds((ids) => change.target.checked ? [...ids, event.id] : ids.filter((id) => id !== event.id))} /><span><strong>{event.title}</strong><time dateTime={event.startsAt}>{dateTime.format(new Date(event.startsAt))}</time></span></label></li>)}</ul>}<div className="replacement-actions replacement-actions--split"><button className="button button--secondary" onClick={() => setStep(1)}><ArrowLeft /> Retour</button><button className="button button--primary" disabled={!selectedIds.length || loading} onClick={() => void openAssignments()}>Attribuer {selectedIds.length || ''} événement{selectedIds.length > 1 ? 's' : ''} <ArrowRight /></button></div></>}
      {step === 3 && <><h2>Attribuer les remplaçants</h2><div className="replacement-assignment-list">{selectedEvents.map((event) => <label className="replacement-field" key={event.id}><span><strong>{event.title}</strong><small>{dateTime.format(new Date(event.startsAt))}</small></span><select aria-label={`Remplaçant pour ${event.title}`} value={assignments[event.id] ?? ''} onChange={(change) => setAssignments((current) => ({ ...current, [event.id]: change.target.value }))}><option value="">Sélectionner une ressource disponible</option>{(available[event.id] ?? []).map((resource) => <option value={resource.id} key={resource.id}>{resource.name}</option>)}</select></label>)}</div><div className="replacement-actions replacement-actions--split"><button className="button button--secondary" onClick={() => setStep(2)}><ArrowLeft /> Retour</button>{success ? <button className="button button--primary" onClick={reset}>Gérer d’autres remplacements</button> : <button className="button button--primary" disabled={loading || selectedEvents.some((event) => !assignments[event.id])} onClick={() => void submit()}><Check /> Enregistrer les remplacements</button>}</div></>}
    </section>
  </div>
}
