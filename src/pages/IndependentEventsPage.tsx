import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, CheckCheck, FilePlus2, MapPin, Pencil, Printer, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { eventDayKey, eventDayLabel, eventMonthKey, eventMonthLabel, eventStart, formatEventTime } from '../lib/unassignedEvents'
import { createIndependentInvoice, deleteIndependentInvoice, getIndependentEvents, getIndependentInvoices, updateIndependentInvoice } from '../services/api'
import { schoolYearForDate } from '../lib/format'
import { formatHoursMinutes } from '../lib/annualSummary'
import type { IndependentEvent, IndependentInvoice } from '../types'

interface SourceCalendar {
  id: string
  name: string
  color: string | null
}

const calendarKey = (event: IndependentEvent) => event.sourceCalendarId || 'unknown'

const duration = (event: IndependentEvent) => event.allDay ? 0 : Math.max(0, (new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) / 3600000)
const totalHours = (items: IndependentEvent[]) => formatHoursMinutes(items.reduce((sum, event) => sum + duration(event), 0))

export function IndependentEventsPage() {
  const currentYear = schoolYearForDate(new Date())
  const [schoolYear, setSchoolYear] = useState(currentYear)
  const [employeeId, setEmployeeId] = useState('')
  const [events, setEvents] = useState<IndependentEvent[]>([])
  const [selectedCalendars, setSelectedCalendars] = useState<Set<string>>(new Set())
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set())
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [receivedOn, setReceivedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [savingInvoice, setSavingInvoice] = useState(false)
  const [invoices, setInvoices] = useState<IndependentInvoice[]>([])
  const [editingInvoice, setEditingInvoice] = useState<IndependentInvoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void getIndependentEvents(schoolYear)
      .then((items) => {
        if (!active) return
        setEvents(items)
        setSelectedCalendars(new Set(items.map(calendarKey))); setSelectedEventIds(new Set())
      })
      .catch(() => { if (active) setError('Les événements des indépendants n’ont pas pu être chargés. Relancez la page.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [schoolYear])

  useEffect(() => {
    if (!employeeId) { setInvoices([]); setEditingInvoice(null); return }
    void getIndependentInvoices(employeeId).then(setInvoices).catch(() => setError('Les factures n’ont pas pu être chargées.'))
  }, [employeeId])

  const employees = useMemo(() => [...new Map(events.map((event) => [event.employeeId, event.employeeName])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'fr')), [events])
  const employeeEvents = useMemo(() => events.filter((event) => !employeeId || event.employeeId === employeeId), [events, employeeId])
  const visibleEvents = useMemo(() => employeeEvents.filter((event) => selectedCalendars.has(calendarKey(event))), [employeeEvents, selectedCalendars])
  const selectedEvents = useMemo(() => employeeEvents.filter((event) => !event.invoiceId && selectedEventIds.has(event.id)), [employeeEvents, selectedEventIds])

  const calendars = useMemo(() => {
    const unique = new Map<string, SourceCalendar>()
    for (const event of employeeEvents) {
      const id = calendarKey(event)
      if (!unique.has(id)) unique.set(id, { id, name: event.sourceCalendarName, color: event.sourceCalendarColor })
    }
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [employeeEvents])

  const groupedEvents = useMemo(() => {
    const visible = visibleEvents
      .map((event, index) => ({ event, index }))
      .sort((a, b) => {
        const dayOrder = eventDayKey(a.event).localeCompare(eventDayKey(b.event))
        if (dayOrder !== 0) return dayOrder
        if (a.event.allDay !== b.event.allDay) return a.event.allDay ? -1 : 1
        const timeOrder = eventStart(a.event).getTime() - eventStart(b.event).getTime()
        return timeOrder || a.index - b.index
      })
      .map(({ event }) => event)
    const groups = new Map<string, Map<string, IndependentEvent[]>>()
    for (const event of visible) {
      const monthKey = eventMonthKey(event)
      const month = groups.get(monthKey) ?? new Map<string, IndependentEvent[]>()
      const dayKey = eventDayKey(event)
      month.set(dayKey, [...(month.get(dayKey) ?? []), event])
      groups.set(monthKey, month)
    }
    return [...groups.entries()]
  }, [visibleEvents])

  const toggleCalendar = (id: string) => {
    setSelectedCalendars((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleEvent = (id: string) => {
    setSelectedEventIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const submitInvoice = async () => {
    if (!employeeId || !selectedEvents.length || savingInvoice) return
    setSavingInvoice(true); setError('')
    try {
      await createIndependentInvoice({ employeeId, eventIds: selectedEvents.map((event) => event.id), schoolYear, invoiceNumber, receivedOn })
      const billedIds = new Set(selectedEvents.map((event) => event.id))
      setEvents((current) => current.map((event) => billedIds.has(event.id) ? { ...event, invoiceId: 'created' } : event))
      setSelectedEventIds(new Set()); setInvoiceNumber('')
      if (employeeId) setInvoices(await getIndependentInvoices(employeeId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'La facture n’a pas pu être enregistrée.')
    } finally { setSavingInvoice(false) }
  }

  return (
    <div className="page unassigned-page independent-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Prestations au temps réel</p>
          <h1>Indépendants</h1>
          <p>Les événements des indépendants, organisés par mois et par journée de début. Les heures correspondent à leur durée réelle, sans préparation.</p>
        </div>
        {!loading && <div className="page-heading__actions">
          <button className="button button--secondary print-button" type="button" onClick={() => window.print()} disabled={groupedEvents.length === 0}>
            <Printer aria-hidden="true" /> Imprimer
          </button>
          <div className="unassigned-total"><strong>{totalHours(visibleEvents)} h</strong><span>{visibleEvents.length} événement{visibleEvents.length > 1 ? 's' : ''} affiché{visibleEvents.length > 1 ? 's' : ''}</span></div>
        </div>}
      </header>

      <section className="filters independent-filters" aria-label="Filtres des indépendants">
        <label><span>Saison</span><div className="select-wrap"><select value={schoolYear} onChange={(event) => {
          setSchoolYear(Number(event.target.value)); setLoading(true); setError(''); setEvents([]); setEmployeeId(''); setSelectedCalendars(new Set()); setSelectedEventIds(new Set())
        }}>{Array.from({ length: 5 }, (_, index) => currentYear - 2 + index).map((year) => <option key={year} value={year}>{year}–{year + 1}</option>)}</select></div></label>
        <label><span>Indépendant</span><div className="select-wrap"><select value={employeeId} disabled={loading} onChange={(event) => { setEmployeeId(event.target.value); setSelectedCalendars(new Set(events.map(calendarKey))); setSelectedEventIds(new Set()) }}>
          <option value="">Tous les indépendants</option>{employees.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></div></label>
      </section>
      {!loading && !error && <p className="independent-context">Saison {schoolYear}–{schoolYear + 1} · {employeeId ? employees.find(([id]) => id === employeeId)?.[1] : 'Tous les indépendants'} · Calendriers : {calendars.filter((calendar) => selectedCalendars.has(calendar.id)).map((calendar) => calendar.name).join(', ') || 'aucun'} · Total réel : {totalHours(visibleEvents)} h</p>}

      {!loading && employeeId && (
        <section className="independent-invoice" aria-labelledby="invoice-title">
          <div><FilePlus2 aria-hidden="true" /><div><h2 id="invoice-title">Ajouter une facture</h2><p>Sélectionnez les événements de la facture. Les événements déjà facturés restent visibles mais ne peuvent pas être sélectionnés.</p></div></div>
          <div className="independent-invoice__fields">
            <label><span>Référence de facture (facultative)</span><input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} /></label>
            <label><span>Date de réception</span><input type="date" value={receivedOn} onChange={(event) => setReceivedOn(event.target.value)} /></label>
            <div className="independent-invoice__total"><strong>{selectedEvents.length} événement{selectedEvents.length > 1 ? 's' : ''} · {totalHours(selectedEvents)} h</strong><button className="button" type="button" disabled={!selectedEvents.length || savingInvoice} onClick={() => void submitInvoice()}>{savingInvoice ? 'Enregistrement…' : 'Valider la facture'}</button></div>
          </div>
        </section>
      )}
      {!loading && employeeId && <section className="independent-invoices" aria-labelledby="invoices-title">
        <h2 id="invoices-title">Factures enregistrées</h2>
        {invoices.length === 0 ? <p>Aucune facture enregistrée pour cet indépendant.</p> : <div className="independent-invoices__list">{invoices.map((invoice) => <article key={invoice.id}>
          <div><strong>{invoice.invoiceNumber || 'Sans référence'}</strong><span>Reçue le {new Date(`${invoice.receivedOn}T12:00:00`).toLocaleDateString('fr-FR')} · {invoice.eventCount} événement{invoice.eventCount > 1 ? 's' : ''} · {formatHoursMinutes(invoice.totalMinutes / 60)} h</span></div>
          <div><button type="button" onClick={() => setEditingInvoice(invoice)}><Pencil aria-hidden="true" /> Modifier</button><button type="button" onClick={() => { if (window.confirm('Supprimer cette facture ? Les événements seront de nouveau disponibles.')) void (async () => { await deleteIndependentInvoice(invoice.id); setInvoices((current) => current.filter((item) => item.id !== invoice.id)); setEvents((current) => current.map((event) => event.invoiceId === invoice.id ? { ...event, invoiceId: null } : event)) })() }}><Trash2 aria-hidden="true" /> Supprimer</button></div>
        </article>)}</div>}
      </section>}
      {editingInvoice && <section className="independent-invoice" aria-label="Modifier la facture"><div><h2>Modifier la facture</h2></div><div className="independent-invoice__fields"><label><span>Référence de facture</span><input value={editingInvoice.invoiceNumber ?? ''} onChange={(event) => setEditingInvoice({ ...editingInvoice, invoiceNumber: event.target.value || null })} /></label><label><span>Date de réception</span><input type="date" value={editingInvoice.receivedOn} onChange={(event) => setEditingInvoice({ ...editingInvoice, receivedOn: event.target.value })} /></label><div className="independent-invoice__total"><button className="button" type="button" onClick={() => void (async () => { await updateIndependentInvoice({ invoiceId: editingInvoice.id, invoiceNumber: editingInvoice.invoiceNumber ?? '', receivedOn: editingInvoice.receivedOn }); setInvoices((current) => current.map((item) => item.id === editingInvoice.id ? editingInvoice : item)); setEditingInvoice(null) })()}>Enregistrer</button><button type="button" onClick={() => setEditingInvoice(null)}>Annuler</button></div></div></section>}

      {error && <div className="alert alert--error" role="alert">{error}</div>}

      {!loading && calendars.length > 0 && (
        <section className="calendar-filter" aria-labelledby="calendar-filter-title">
          <div className="calendar-filter__heading">
            <div><SlidersHorizontal aria-hidden="true" /><span><strong id="calendar-filter-title">Calendriers concernés</strong><small>Sélection multiple</small></span></div>
            <div className="calendar-filter__actions">
              <button type="button" onClick={() => setSelectedCalendars(new Set(calendars.map((calendar) => calendar.id)))}><CheckCheck aria-hidden="true" /> Tout afficher</button>
              <button type="button" onClick={() => setSelectedCalendars(new Set())}><X aria-hidden="true" /> Aucun</button>
            </div>
          </div>
          <div className="calendar-filter__options">
            {calendars.map((calendar) => (
              <label className="calendar-choice" key={calendar.id}>
                <input type="checkbox" checked={selectedCalendars.has(calendar.id)} onChange={() => toggleCalendar(calendar.id)} />
                <span className="calendar-choice__box" aria-hidden="true" />
                <i style={{ backgroundColor: calendar.color ?? '#83918c' }} />
                <span>{calendar.name}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {loading ? <div className="unassigned-skeleton" aria-label="Chargement des événements"><i /><i /><i /></div> : error ? null : groupedEvents.length === 0 ? (
        <div className="empty-state unassigned-empty">
          <CalendarClock aria-hidden="true" />
          <strong>{events.length ? 'Aucun événement avec ces filtres' : 'Aucun événement indépendant pour cette saison'}</strong>
          <span>{events.length ? 'Sélectionnez au moins un calendrier pour afficher ses événements.' : 'Les événements des ressources indépendantes apparaîtront ici après synchronisation.'}</span>
        </div>
      ) : groupedEvents.map(([key, monthDays]) => {
        const monthEvents = [...monthDays.values()].flat()
        return (
        <section className="event-month" key={key} aria-labelledby={`month-${key}`}>
          <header className="event-month__heading">
            <h2 id={`month-${key}`}>{eventMonthLabel(monthEvents[0])}</h2>
            <span>{monthDays.size} jour{monthDays.size > 1 ? 's' : ''} · {monthEvents.length} événement{monthEvents.length > 1 ? 's' : ''} · {totalHours(monthEvents)} h</span>
          </header>
          <div className="day-card-grid">
            {[...monthDays.entries()].map(([dayKey, dayEvents]) => {
              const headingId = `day-${dayKey}`
              return <article className="day-card" key={dayKey} aria-labelledby={headingId}>
                <header className="day-card__heading">
                  <div><CalendarClock aria-hidden="true" /><h3 id={headingId}><time dateTime={dayKey}>{eventDayLabel(dayEvents[0])}</time></h3></div>
                  <span>{dayEvents.length} événement{dayEvents.length > 1 ? 's' : ''} · {totalHours(dayEvents)} h</span>
                </header>
                <div className="day-card__events">
                  {dayEvents.map((event) => (
                    <section className="day-event" key={`${event.employeeId}-${event.id}`}>
                      {employeeId && <label className="independent-event-select">
                        <input type="checkbox" checked={selectedEventIds.has(event.id)} disabled={Boolean(event.invoiceId)} onChange={() => toggleEvent(event.id)} aria-label={`Ajouter ${event.title} à la facture`} />
                        <span>{event.invoiceId ? 'Déjà facturé' : 'Facturer'}</span>
                      </label>}
                      <i className="day-event__calendar-line" style={{ backgroundColor: event.sourceCalendarColor ?? '#83918c' }} />
                      <time className="day-event__time" dateTime={event.startsAt}>{formatEventTime(event)}<br /><strong>{formatHoursMinutes(duration(event))} h</strong></time>
                      <h4>{event.title}</h4>
                      <div className="day-event__meta">
                        <span>{event.employeeName}</span>
                        <span><i style={{ backgroundColor: event.sourceCalendarColor ?? '#83918c' }} />{event.sourceCalendarName}</span>
                        {event.location && <span><MapPin aria-hidden="true" />{event.location}</span>}
                      </div>
                      <p className={event.description ? '' : 'day-event__description--empty'}>{event.description || 'Aucune description renseignée.'}</p>
                    </section>
                  ))}
                </div>
              </article>
            })}
          </div>
        </section>
        )
      })}
    </div>
  )
}
