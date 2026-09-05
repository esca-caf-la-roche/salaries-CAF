import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, CircleAlert, GripVertical, Mail, RefreshCw, Search } from 'lucide-react'
import { discoverResources, getCoefficientCalendars, getResources, saveCoefficientCalendars, saveResources, startGoogleConnection } from '../services/api'
import type { ContractType, EmployeeResource, HourCategory, PreparationCoefficient, UsedCalendarCoefficient } from '../types'
import { contractTypeLabel } from '../lib/contracts'

const configuredHourCategories: Array<{ value: HourCategory; label: string }> = [
  { value: 'contract', label: 'Heures du contrat' },
  { value: 'absence', label: "Heures d'absences" },
  { value: 'replacement', label: 'Heures de remplacements' },
  { value: 'public_holiday', label: 'Heures fériées' },
]

const preparationGroups: Array<{ value: PreparationCoefficient; label: string; coefficientLabel: string }> = [
  { value: 1.25, label: 'Avec prépa', coefficientLabel: '× 1,25' },
  { value: 1, label: 'Sans prépa', coefficientLabel: '× 1' },
]

type ResourceGroupKey = ContractType | 'unassigned' | 'unknown'

const resourceGroups: Array<{ value: ResourceGroupKey; label: string; caption: string }> = [
  { value: 'CDI', label: 'CDI', caption: 'Contrats à durée indéterminée' },
  { value: 'CDII', label: 'CDII', caption: 'Contrats intermittents' },
  { value: 'CDD', label: 'CDD', caption: 'Contrats à durée déterminée' },
  { value: 'INDEP', label: 'Indépendant', caption: 'Durée réelle des événements, tous calendriers' },
  { value: 'unassigned', label: 'Sans contrat', caption: 'Cours sans moniteur attribué' },
  { value: 'unknown', label: 'À vérifier', caption: 'Type de contrat non détecté' },
]

function getResourceGroup(resource: EmployeeResource): ResourceGroupKey {
  if (resource.isUnassignedResource) return 'unassigned'
  return resource.contractType ?? 'unknown'
}

interface ResourceCardProps {
  resource: EmployeeResource
  onPatch: (id: string, patch: Partial<EmployeeResource>) => void
}

function ResourceCard({ resource, onPatch }: ResourceCardProps) {
  return (
    <article className={`resource-card${resource.enabled ? ' resource-card--enabled' : ' resource-card--disabled'}`}>
      <header className="resource-card__heading">
        <div className="resource-card__identity">
          <i style={{ background: resource.color }} aria-hidden="true" />
          <span>
            <strong>{resource.name}</strong>
            <small>{resource.eventCount ?? 0} événement{resource.eventCount !== 1 ? 's' : ''}</small>
          </span>
        </div>
        {resource.isUnassignedResource
          ? <span className="automatic-tracking"><Check aria-hidden="true" /> Suivi automatique</span>
          : <label className="switch"><input type="checkbox" checked={resource.enabled} onChange={(event) => onPatch(resource.id, { enabled: event.target.checked })} /><span aria-hidden="true" /><em>{resource.enabled ? 'Suivie' : 'Ignorée'}</em></label>}
      </header>
      <div className="resource-card__meta">
        <span className="resource-contract" aria-label={`Type de contrat de ${resource.name}`}>{resource.isUnassignedResource ? 'Sans contrat' : contractTypeLabel(resource.contractType)}</span>
        <code title={resource.googleCalendarId}>{resource.googleCalendarId}</code>
      </div>
      {resource.isUnassignedResource ? (
        <p className="resource-card__automatic">Cette ressource reste suivie sans compte salarié, volume annuel ni e-mail.</p>
      ) : (
        <div className="resource-card__fields">
          {resource.contractType === 'INDEP' ? <p className="resource-card__automatic">Temps réel de tous les événements horaires, sans majoration de préparation ni volume annuel requis.</p> : <label className="resource-field">
            <span>Heures annuelles</span>
            <span className="hours-input"><input aria-label={`Heures annuelles de ${resource.name}`} type="number" min="0.01" step="0.01" placeholder="Ex. 1607" value={resource.annualContractHours ?? ''} onChange={(event) => onPatch(resource.id, { annualContractHours: event.target.value === '' ? null : Number(event.target.value) })} /><span>h</span></span>
          </label>}
          <label className="resource-field">
            <span>E-mail de connexion</span>
            <span className="email-input"><Mail aria-hidden="true" /><input type="email" aria-label={`E-mail de connexion de ${resource.name}`} placeholder="prenom@exemple.fr" value={resource.loginEmail} disabled={!resource.enabled} required={resource.enabled} onChange={(event) => onPatch(resource.id, { loginEmail: event.target.value })} /></span>
          </label>
        </div>
      )}
    </article>
  )
}

type KanbanDestination =
  | { kind: 'undefined' }
  | { kind: 'preparation'; coefficient: PreparationCoefficient }
  | { kind: 'category'; hourCategory: HourCategory }

interface CalendarCardProps {
  calendar: UsedCalendarCoefficient
  selected: boolean
  onSelect: (googleCalendarId: string) => void
  onDragStart: (googleCalendarId: string) => void
  onDragEnd: () => void
}

function CalendarCard({ calendar, selected, onSelect, onDragStart, onDragEnd }: CalendarCardProps) {
  return (
    <button
      className={`kanban-card${selected ? ' kanban-card--selected' : ''}`}
      type="button"
      draggable
      data-calendar-id={calendar.googleCalendarId}
      aria-pressed={selected}
      aria-label={`${calendar.name}, ${calendar.coefficient === 1.25 ? 'avec préparation' : calendar.coefficient === 1 ? 'sans préparation' : 'préparation à définir'}, identifiant ${calendar.googleCalendarId}`}
      onClick={() => onSelect(calendar.googleCalendarId)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', calendar.googleCalendarId)
        onDragStart(calendar.googleCalendarId)
      }}
      onDragEnd={onDragEnd}
    >
      <i className="calendar-color" style={calendar.color ? { background: calendar.color } : undefined} aria-hidden="true" />
      <span className="kanban-card__content">
        <strong>{calendar.name}</strong>
        <small>{calendar.eventCount} événement{calendar.eventCount !== 1 ? 's' : ''} · {calendar.googleCalendarId}</small>
        {calendar.coefficient != null && <em>{calendar.coefficient === 1.25 ? 'Avec prépa · × 1,25' : 'Sans prépa · × 1'}</em>}
      </span>
      <GripVertical aria-hidden="true" />
    </button>
  )
}

interface KanbanLaneProps {
  id: string
  title: string
  caption: string
  calendars: UsedCalendarCoefficient[]
  destination: KanbanDestination
  activeCalendarId: string | null
  activeCalendarName: string | null
  canReceive: boolean
  variant?: 'undefined' | 'preparation' | 'category'
  onSelect: (googleCalendarId: string) => void
  onDragStart: (googleCalendarId: string) => void
  onDragEnd: () => void
  onMove: (googleCalendarId: string, destination: KanbanDestination) => void
}

function KanbanLane({ id, title, caption, calendars, destination, activeCalendarId, activeCalendarName, canReceive, variant = 'category', onSelect, onDragStart, onDragEnd, onMove }: KanbanLaneProps) {
  return (
    <section
      className={`kanban-lane kanban-lane--${variant}${canReceive ? ' kanban-lane--available' : ''}`}
      aria-labelledby={`${id}-title`}
      onDragOver={(event) => {
        if (!canReceive) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        if (!canReceive) return
        event.preventDefault()
        const googleCalendarId = event.dataTransfer.getData('text/plain') || activeCalendarId
        if (googleCalendarId) onMove(googleCalendarId, destination)
      }}
    >
      <header className="kanban-lane__heading">
        <span><strong id={`${id}-title`}>{title}</strong><small>{caption}</small></span>
        <b aria-label={`${calendars.length} calendrier${calendars.length !== 1 ? 's' : ''}`}>{calendars.length}</b>
      </header>
      {canReceive && activeCalendarId && (
        <button className="kanban-drop-action" type="button" aria-label={`Déplacer ${activeCalendarName ?? 'le calendrier'} vers ${title}`} onClick={() => onMove(activeCalendarId, destination)}>
          Déplacer ici
        </button>
      )}
      <div className="kanban-lane__cards">
        {calendars.map((calendar) => (
          <CalendarCard
            calendar={calendar}
            selected={activeCalendarId === calendar.googleCalendarId}
            onSelect={onSelect}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            key={calendar.googleCalendarId}
          />
        ))}
        {!calendars.length && <p className="kanban-empty">Déposez un calendrier ici</p>}
      </div>
    </section>
  )
}

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
  const [activeCalendarId, setActiveCalendarId] = useState<string | null>(null)
  const [movedCalendarId, setMovedCalendarId] = useState<string | null>(null)
  const [kanbanAnnouncement, setKanbanAnnouncement] = useState('')
  const [message, setMessage] = useState('')
  const [resourceMessage, setResourceMessage] = useState('')

  useEffect(() => { void getResources().then(setResources).catch(() => setMessage('Les ressources n\'ont pas pu être chargées.')).finally(() => setLoading(false)) }, [])
  useEffect(() => { void getCoefficientCalendars().then(setCoefficientCalendars).catch(() => setMessage('Les calendriers utilisés n\'ont pas pu être chargés.')).finally(() => setCoefficientsLoading(false)) }, [])
  useEffect(() => {
    if (!movedCalendarId) return
    const movedCard = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-calendar-id]'))
      .find((element) => element.dataset.calendarId === movedCalendarId)
    movedCard?.focus()
    setMovedCalendarId(null)
  }, [coefficientCalendars, movedCalendarId])
  const filtered = useMemo(() => {
    const normalizedQuery = query.toLocaleLowerCase('fr')
    return resources.filter((resource) => `${resource.name} ${resource.googleCalendarId} ${resource.loginEmail} ${resource.contractType ?? ''}`.toLocaleLowerCase('fr').includes(normalizedQuery))
  }, [resources, query])
  const enabledCount = resources.filter((resource) => resource.enabled).length
  const groupedResources = useMemo(() => ({
    enabled: resourceGroups.map((group) => ({
      ...group,
      resources: filtered.filter((resource) => resource.enabled && getResourceGroup(resource) === group.value),
    })).filter((group) => group.resources.length > 0),
    disabled: filtered.filter((resource) => !resource.enabled),
  }), [filtered])
  const kanbanCalendars = useMemo(() => {
    return {
      undefinedCalendars: coefficientCalendars.filter((calendar) => calendar.coefficient == null),
      preparationGroups: preparationGroups.map((preparation) => ({
        ...preparation,
        calendars: coefficientCalendars.filter((calendar) => calendar.coefficient === preparation.value && calendar.hourCategory == null),
      })),
      categories: configuredHourCategories.map((category) => ({
        ...category,
        calendars: coefficientCalendars.filter((calendar) => calendar.hourCategory === category.value && calendar.coefficient != null),
      })),
    }
  }, [coefficientCalendars])
  const activeCalendar = coefficientCalendars.find((calendar) => calendar.googleCalendarId === activeCalendarId) ?? null
  const hasIncompleteDirtyRules = coefficientCalendars.some((calendar) => coefficientDirty.has(calendar.googleCalendarId) && (calendar.hourCategory == null || calendar.coefficient == null))

  const patchResource = (id: string, patch: Partial<EmployeeResource>) => {
    setResources((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item))
    setDirty((items) => new Set(items).add(id))
    setResourceMessage('')
    setMessage('')
  }
  const detect = async () => {
    setDiscovering(true)
    setMessage('')
    try { setResources(await discoverResources()); setDirty(new Set()); setMessage('Liste des ressources salariées actualisée.') }
    catch { setMessage('La détection a échoué. Reconnectez le compte Google puis réessayez.') }
    finally { setDiscovering(false) }
  }
  const selectCalendar = (googleCalendarId: string) => {
    if (activeCalendarId === googleCalendarId) {
      setActiveCalendarId(null)
      setKanbanAnnouncement('Sélection annulée.')
      return
    }
    setActiveCalendarId(googleCalendarId)
    const calendar = coefficientCalendars.find((item) => item.googleCalendarId === googleCalendarId)
    setKanbanAnnouncement(calendar ? `${calendar.name} sélectionné. Choisissez une destination.` : '')
  }
  const moveCalendar = (googleCalendarId: string, destination: KanbanDestination) => {
    const calendar = coefficientCalendars.find((item) => item.googleCalendarId === googleCalendarId)
    if (!calendar) return
    let patch: Pick<UsedCalendarCoefficient, 'coefficient' | 'hourCategory'>
    let destinationLabel: string
    if (destination.kind === 'undefined') {
      if (calendar.coefficient == null && calendar.hourCategory == null) return
      patch = { coefficient: null, hourCategory: null }
      destinationLabel = 'À définir ; préparation et type d’heures remis à définir'
    } else if (destination.kind === 'preparation') {
      if (calendar.coefficient === destination.coefficient && calendar.hourCategory == null) return
      patch = { coefficient: destination.coefficient, hourCategory: null }
      destinationLabel = `${destination.coefficient === 1.25 ? 'Avec prépa' : 'Sans prépa'} ; choisissez maintenant le type d’heures`
    } else {
      if (calendar.coefficient == null) {
        setKanbanAnnouncement('Choisissez d’abord avec ou sans prépa.')
        return
      }
      if (calendar.hourCategory === destination.hourCategory) return
      patch = { coefficient: calendar.coefficient, hourCategory: destination.hourCategory }
      destinationLabel = configuredHourCategories.find((category) => category.value === destination.hourCategory)?.label ?? 'type d’heures'
    }
    setCoefficientCalendars((items) => items.map((item) => item.googleCalendarId === googleCalendarId ? { ...item, ...patch } : item))
    setCoefficientDirty((items) => new Set(items).add(googleCalendarId))
    setActiveCalendarId(destination.kind === 'preparation' ? googleCalendarId : null)
    setMovedCalendarId(googleCalendarId)
    setKanbanAnnouncement(`${calendar.name} déplacé vers ${destinationLabel}.`)
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
      setActiveCalendarId(null)
      setMessage('Calendriers utilisés actualisés.')
    } catch { setMessage('La détection des calendriers utilisés a échoué.') }
    finally { setCoefficientsRefreshing(false) }
  }
  const save = async () => {
    const changed = resources.filter((resource) => dirty.has(resource.id))
    const invalid = changed.find((resource) => !resource.isUnassignedResource && resource.enabled && !/^\S+@\S+\.\S+$/.test(resource.loginEmail.trim()))
    if (invalid) { setResourceMessage(`Ajoutez un e-mail de connexion valide pour ${invalid.name}.`); return }
    const missingContract = changed.find((resource) => !resource.isUnassignedResource && resource.enabled && (!resource.contractType || (resource.contractType !== 'INDEP' && (resource.annualContractHours == null || resource.annualContractHours <= 0))))
    if (missingContract) { setResourceMessage(`Ajoutez le type de contrat et les heures annuelles de ${missingContract.name}.`); return }
    setSaving(true)
    setResourceMessage('')
    setMessage('')
    try {
      setResources(await saveResources(changed))
      setDirty(new Set())
      setResourceMessage('Configuration enregistrée. Les contrats et le suivi des ressources sont à jour.')
    } catch (error) { setResourceMessage(error instanceof Error ? error.message : 'Les modifications n\'ont pas pu être enregistrées.') }
    finally { setSaving(false) }
  }
  const saveCoefficients = async () => {
    const changed = coefficientCalendars.filter((calendar) => coefficientDirty.has(calendar.googleCalendarId))
    if (changed.some((calendar) => calendar.hourCategory == null || calendar.coefficient == null)) {
      setMessage('Définissez la catégorie d\'heures et le coefficient de chaque calendrier modifié.')
      return
    }
    setCoefficientsSaving(true)
    setMessage('')
    try {
      const savedCalendars = await saveCoefficientCalendars(changed)
      const savedById = new Map(savedCalendars.map((calendar) => [calendar.googleCalendarId, calendar]))
      setCoefficientCalendars((items) => items.map((item) => {
        const saved = savedById.get(item.googleCalendarId)
        return saved ? { ...item, ...saved, color: saved.color ?? item.color } : item
      }))
      setCoefficientDirty(new Set())
      setMessage('Règles de comptage enregistrées. Les heures de la saison sont à jour.')
    } catch { setMessage('Les coefficients n\'ont pas pu être enregistrés.') }
    finally { setCoefficientsSaving(false) }
  }

  return (
    <div className="page">
      <header className="page-heading">
        <div><p className="eyebrow">Paramétrage</p><h1>Ressources et comptage</h1><p>Configurez les contrats des ressources, puis classez les heures des calendriers utilisés.</p></div>
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
        <div><strong>Comment fonctionne le calcul ?</strong><p>Les heures annuelles fixent l'objectif du salarié. Chaque calendrier choisit d'abord son niveau de préparation, puis son type d'heures. Pour une ressource marquée (Indep), tous les événements horaires comptent au temps réel, même sans règle de calendrier. Une saison va du 1er septembre au 31 août.</p></div>
        <code>calendrier → prépa → type d'heures</code>
      </section>
      <section className="panel configuration-panel">
        <div className="configuration-toolbar">
          <div><p className="eyebrow">Calendriers ressources Google</p><h2>{enabledCount} ressource{enabledCount > 1 ? 's' : ''} suivie{enabledCount > 1 ? 's' : ''}</h2></div>
          <label className="search-field"><Search aria-hidden="true" /><span className="sr-only">Rechercher une ressource</span><input type="search" placeholder="Rechercher…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        </div>
        {loading ? <div className="skeleton-list" aria-label="Chargement des ressources"><i /><i /><i /></div> : (
          <div className="resource-shelf">
            <div className="resource-groups">
              {groupedResources.enabled.map((group) => <section className="resource-group" aria-labelledby={`resource-group-${group.value}`} key={group.value}>
                <header className="resource-group__heading">
                  <span><strong id={`resource-group-${group.value}`}>{group.label}</strong><small>{group.caption}</small></span>
                  <b aria-label={`${group.resources.length} ressource${group.resources.length !== 1 ? 's' : ''}`}>{group.resources.length}</b>
                </header>
                <div className="resource-group__cards">
                  {group.resources.map((resource) => <ResourceCard resource={resource} onPatch={patchResource} key={resource.id} />)}
                </div>
              </section>)}
            </div>
            {!groupedResources.enabled.length && filtered.length > 0 && <div className="resource-empty"><strong>Aucune ressource suivie dans cette sélection</strong><span>Les ressources correspondantes sont rangées dans le volet ci-dessous.</span></div>}
            <details className="unused-resources" open={query.trim().length > 0 || undefined}>
              <summary>
                <span><ChevronDown aria-hidden="true" /><span><strong>Ressources non suivies</strong><small>Repliées pour garder la configuration lisible</small></span></span>
                <b aria-label={`${groupedResources.disabled.length} ressource${groupedResources.disabled.length !== 1 ? 's' : ''} non suivie${groupedResources.disabled.length !== 1 ? 's' : ''}`}>{groupedResources.disabled.length}</b>
              </summary>
              <div className="unused-resources__cards">
                {groupedResources.disabled.map((resource) => <ResourceCard resource={resource} onPatch={patchResource} key={resource.id} />)}
                {!groupedResources.disabled.length && <p>Aucune ressource non suivie ne correspond à la recherche.</p>}
              </div>
            </details>
            {!filtered.length && <div className="empty-state"><Search aria-hidden="true" /><strong>Aucune ressource trouvée</strong><span>Modifiez votre recherche ou relancez la détection Google.</span></div>}
          </div>
        )}
        <footer className="configuration-footer"><span role="status">{resourceMessage || (dirty.size ? `${dirty.size} modification${dirty.size > 1 ? 's' : ''} non enregistrée${dirty.size > 1 ? 's' : ''}` : <><Check aria-hidden="true" /> Configuration à jour</>)}</span><button className="button button--primary" type="button" onClick={() => void save()} disabled={!dirty.size || saving}>{saving ? 'Enregistrement…' : 'Enregistrer les modifications'}</button></footer>
      </section>
      <section className="panel configuration-panel coefficient-panel" id="calendriers-utilises">
        <div className="configuration-toolbar">
          <div><p className="eyebrow">Calendriers utilisés</p><h2>{coefficientCalendars.length} calendrier{coefficientCalendars.length > 1 ? 's' : ''} détecté{coefficientCalendars.length > 1 ? 's' : ''}</h2></div>
          <button className="button button--secondary" type="button" onClick={() => void refreshCoefficients()} disabled={coefficientsRefreshing}>
            <RefreshCw className={coefficientsRefreshing ? 'spin' : ''} aria-hidden="true" /> {coefficientsRefreshing ? 'Actualisation…' : 'Actualiser les calendriers utilisés'}
          </button>
        </div>
        {coefficientsLoading ? <div className="skeleton-list" aria-label="Chargement des calendriers utilisés"><i /><i /></div> : (
          <div className="kanban-shell">
            <div className="kanban-instructions">
              <span><b>1</b> Choisissez la préparation</span>
              <i aria-hidden="true" />
              <span><b>2</b> Classez le type d'heures</span>
              <p>Sélectionnez une carte puis cliquez sur « Déplacer ici », ou faites-la glisser.</p>
            </div>
            <p className="sr-only" aria-live="polite">{kanbanAnnouncement}</p>
            {activeCalendar && <div className="kanban-selection" role="status"><span><i style={activeCalendar.color ? { background: activeCalendar.color } : undefined} />{activeCalendar.name} sélectionné</span><button type="button" onClick={() => setActiveCalendarId(null)}>Annuler</button></div>}
            <div className="kanban-board">
              <div className="kanban-stage kanban-stage--waiting">
                <div className="kanban-stage__label"><b>Départ</b><span>Règles incomplètes</span></div>
                <KanbanLane
                  id="kanban-undefined"
                  title="À définir"
                  caption="Commencez par la préparation"
                  calendars={kanbanCalendars.undefinedCalendars}
                  destination={{ kind: 'undefined' }}
                  activeCalendarId={activeCalendarId}
                  activeCalendarName={activeCalendar?.name ?? null}
                  canReceive={activeCalendar != null && (activeCalendar.coefficient != null || activeCalendar.hourCategory != null)}
                  variant="undefined"
                  onSelect={selectCalendar}
                  onDragStart={setActiveCalendarId}
                  onDragEnd={() => undefined}
                  onMove={moveCalendar}
                />
              </div>
              <div className="kanban-stage">
                <div className="kanban-stage__label"><b>Étape 1</b><span>Niveau de préparation</span></div>
                <div className="kanban-stage__grid kanban-stage__grid--preparation">
                  {kanbanCalendars.preparationGroups.map((preparation) => (
                    <KanbanLane
                      id={`kanban-preparation-${preparation.value}`}
                      title={preparation.label}
                      caption={`${preparation.coefficientLabel} · type remis à définir`}
                      calendars={preparation.calendars}
                      destination={{ kind: 'preparation', coefficient: preparation.value }}
                      activeCalendarId={activeCalendarId}
                      activeCalendarName={activeCalendar?.name ?? null}
                      canReceive={activeCalendar != null && (activeCalendar.coefficient !== preparation.value || activeCalendar.hourCategory != null)}
                      variant="preparation"
                      onSelect={selectCalendar}
                      onDragStart={setActiveCalendarId}
                      onDragEnd={() => undefined}
                      onMove={moveCalendar}
                      key={preparation.value}
                    />
                  ))}
                </div>
              </div>
              <div className="kanban-stage">
                <div className="kanban-stage__label"><b>Étape 2</b><span>Type d'heures</span></div>
                <div className="kanban-stage__grid kanban-stage__grid--categories">
                  {kanbanCalendars.categories.map((category) => (
                    <KanbanLane
                      id={`kanban-category-${category.value}`}
                      title={category.label}
                      caption="Destination finale"
                      calendars={category.calendars}
                      destination={{ kind: 'category', hourCategory: category.value }}
                      activeCalendarId={activeCalendarId}
                      activeCalendarName={activeCalendar?.name ?? null}
                      canReceive={activeCalendar?.coefficient != null && activeCalendar.hourCategory !== category.value}
                      onSelect={selectCalendar}
                      onDragStart={setActiveCalendarId}
                      onDragEnd={() => undefined}
                      onMove={moveCalendar}
                      key={category.value}
                    />
                  ))}
                </div>
              </div>
            </div>
            {!coefficientCalendars.length && <div className="empty-state"><Search aria-hidden="true" /><strong>Aucun calendrier utilisé détecté</strong><span>Activez une ressource puis lancez une synchronisation pour analyser ses événements.</span></div>}
          </div>
        )}
        <footer className="configuration-footer"><span>{hasIncompleteDirtyRules ? 'Terminez le classement des cartes déplacées.' : coefficientDirty.size ? `${coefficientDirty.size} règle${coefficientDirty.size > 1 ? 's' : ''} non enregistrée${coefficientDirty.size > 1 ? 's' : ''}` : <><Check aria-hidden="true" /> Règles de comptage à jour</>}</span><button className="button button--primary" type="button" onClick={() => void saveCoefficients()} disabled={!coefficientDirty.size || hasIncompleteDirtyRules || coefficientsSaving}>{coefficientsSaving ? 'Enregistrement…' : 'Enregistrer les règles'}</button></footer>
      </section>
    </div>
  )
}
