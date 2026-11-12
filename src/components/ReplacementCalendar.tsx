import type { ReplacementEvent } from '../types'

const fullDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const weekdays = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.']

export function ReplacementCalendar({ month, events, selectedIds, onToggle }: {
  month: Date
  events: ReplacementEvent[]
  selectedIds: string[]
  onToggle: (event: ReplacementEvent) => void
}) {
  const offset = (month.getDay() + 6) % 7
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = Math.ceil((offset + count) / 7) * 7
  const today = new Date().toDateString()
  return <div className="replacement-calendar" aria-label="Calendrier des événements">
    <div className="replacement-calendar__weekdays" aria-hidden="true">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
    <div className="replacement-calendar__days">
      {Array.from({ length: cells }, (_, index) => {
        const day = index - offset + 1
        if (day < 1 || day > count) return <div className="replacement-calendar__outside" aria-hidden="true" key={index} />
        const date = new Date(month.getFullYear(), month.getMonth(), day)
        const dayEvents = events.filter((event) => new Date(event.startsAt).toDateString() === date.toDateString()).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
        return <section className={`replacement-calendar__day${dayEvents.length ? ' has-events' : ''}`} aria-label={fullDate.format(date)} key={index}>
          <time className="replacement-calendar__date" dateTime={`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`} aria-current={date.toDateString() === today ? 'date' : undefined}><span className="replacement-calendar__mobile-date">{fullDate.format(date)}</span><span className="replacement-calendar__number">{day}</span></time>
          {dayEvents.map((event) => <label className={`replacement-calendar__event${selectedIds.includes(event.id) ? ' is-selected' : ''}`} key={event.id}>
            <input type="checkbox" checked={selectedIds.includes(event.id)} onChange={() => onToggle(event)} />
            <span><time dateTime={event.startsAt}>{time.format(new Date(event.startsAt))} – {time.format(new Date(event.endsAt))}</time><strong>{event.title}</strong></span>
          </label>)}
        </section>
      })}
    </div>
  </div>
}
