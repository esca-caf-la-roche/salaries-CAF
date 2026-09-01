import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, CheckCheck, MapPin, SlidersHorizontal, X } from 'lucide-react'
import { eventMonthKey, eventMonthLabel, eventStart, formatEventDate } from '../lib/unassignedEvents'
import { getUnassignedEvents } from '../services/api'
import type { UnassignedEvent } from '../types'

interface SourceCalendar {
  id: string
  name: string
  color: string | null
}

const calendarKey = (event: UnassignedEvent) => event.sourceCalendarId || 'unknown'

export function UnassignedEventsPage() {
  const [events, setEvents] = useState<UnassignedEvent[]>([])
  const [selectedCalendars, setSelectedCalendars] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    void getUnassignedEvents()
      .then((items) => {
        setEvents(items)
        setSelectedCalendars(new Set(items.map(calendarKey)))
      })
      .catch(() => setError('Les événements à déterminer n’ont pas pu être chargés. Relancez la page.'))
      .finally(() => setLoading(false))
  }, [])

  const calendars = useMemo(() => {
    const unique = new Map<string, SourceCalendar>()
    for (const event of events) {
      const id = calendarKey(event)
      if (!unique.has(id)) unique.set(id, { id, name: event.sourceCalendarName, color: event.sourceCalendarColor })
    }
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [events])

  const groupedEvents = useMemo(() => {
    const visible = events
      .filter((event) => selectedCalendars.has(calendarKey(event)))
      .sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime())
    const groups = new Map<string, UnassignedEvent[]>()
    for (const event of visible) {
      const key = eventMonthKey(event)
      groups.set(key, [...(groups.get(key) ?? []), event])
    }
    return [...groups.entries()]
  }, [events, selectedCalendars])

  const toggleCalendar = (id: string) => {
    setSelectedCalendars((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="page unassigned-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Affectations en attente</p>
          <h1>À déterminer</h1>
          <p>Tous les événements encore associés à la ressource « À déterminer », organisés par mois et par calendrier d’origine.</p>
        </div>
        {!loading && <div className="unassigned-total"><strong>{events.length}</strong><span>événement{events.length > 1 ? 's' : ''} au total</span></div>}
      </header>

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

      {loading ? <div className="unassigned-skeleton" aria-label="Chargement des événements"><i /><i /><i /></div> : groupedEvents.length === 0 ? (
        <div className="empty-state unassigned-empty">
          <CalendarClock aria-hidden="true" />
          <strong>{events.length ? 'Aucun événement avec ces calendriers' : 'Aucun événement à déterminer'}</strong>
          <span>{events.length ? 'Sélectionnez au moins un calendrier pour afficher ses événements.' : 'Les prochains événements non attribués apparaîtront ici après synchronisation.'}</span>
        </div>
      ) : groupedEvents.map(([key, monthEvents]) => (
        <section className="event-month" key={key} aria-labelledby={`month-${key}`}>
          <header className="event-month__heading">
            <h2 id={`month-${key}`}>{eventMonthLabel(monthEvents[0])}</h2>
            <span>{monthEvents.length} événement{monthEvents.length > 1 ? 's' : ''}</span>
          </header>
          <div className="event-card-grid">
            {monthEvents.map((event) => (
              <article className="event-card" key={event.id}>
                <i className="event-card__calendar-line" style={{ backgroundColor: event.sourceCalendarColor ?? '#83918c' }} />
                <div className="event-card__date"><CalendarClock aria-hidden="true" /><span>{formatEventDate(event)}</span>{event.allDay && <em>Toute la journée</em>}</div>
                <h3>{event.title}</h3>
                <div className="event-card__meta">
                  <span><i style={{ backgroundColor: event.sourceCalendarColor ?? '#83918c' }} />{event.sourceCalendarName}</span>
                  {event.location && <span><MapPin aria-hidden="true" />{event.location}</span>}
                </div>
                <p className={event.description ? '' : 'event-card__description--empty'}>{event.description || 'Aucune description renseignée.'}</p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
