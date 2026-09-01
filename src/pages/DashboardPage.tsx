import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, CircleAlert, Clock3, RefreshCw, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { HoursChart } from '../components/HoursChart'
import { formatHours, formatSyncDate, monthLabel, schoolMonths, schoolYearForDate } from '../lib/format'
import { getCoefficientCalendars, getEmployeeSummaries, getUnassignedEvents, runIncrementalSync } from '../services/api'
import type { EmployeeSummary, SyncState, UnassignedEvent, UsedCalendarCoefficient } from '../types'
import { useAuth } from '../context/AuthContext'
import { eventStart, formatEventDate, isEventWithinNextDays } from '../lib/unassignedEvents'

const currentDate = new Date()
const currentSchoolYear = schoolYearForDate(currentDate)

export function DashboardPage() {
  const { user } = useAuth()
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear)
  const [selectedEmployee, setSelectedEmployee] = useState('all')
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(currentDate.getMonth() + 1)
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sync, setSync] = useState<SyncState>({ status: 'idle', lastSyncedAt: null })
  const [usedCalendars, setUsedCalendars] = useState<UsedCalendarCoefficient[]>([])
  const [unassignedEvents, setUnassignedEvents] = useState<UnassignedEvent[]>([])

  useEffect(() => {
    setLoading(true)
    setError('')
    void getEmployeeSummaries(schoolYear)
      .then(setEmployees)
      .catch(() => setError('Les heures n\'ont pas pu être chargées. Relancez la page.'))
      .finally(() => setLoading(false))
  }, [schoolYear])

  useEffect(() => {
    if (user?.role !== 'admin') return
    void getCoefficientCalendars().then(setUsedCalendars).catch(() => setUsedCalendars([]))
    void getUnassignedEvents().then(setUnassignedEvents).catch(() => setUnassignedEvents([]))
  }, [user?.role])

  const visible = useMemo(() => selectedEmployee === 'all' ? employees : employees.filter((item) => item.id === selectedEmployee), [employees, selectedEmployee])
  const combined = useMemo(() => schoolMonths.map((monthNumber) => visible.reduce((total, employee) => {
    const month = employee.monthlyHours.find((item) => item.month === monthNumber)
    return {
      month: monthNumber,
      rawHours: total.rawHours + (month?.rawHours ?? 0),
      weightedHours: total.weightedHours + (month?.weightedHours ?? 0),
      contractHours: total.contractHours + (month?.contractHours ?? 0),
      absenceHours: total.absenceHours + (month?.absenceHours ?? 0),
      replacementHours: total.replacementHours + (month?.replacementHours ?? 0),
      publicHolidayHours: total.publicHolidayHours + (month?.publicHolidayHours ?? 0),
      eventCount: total.eventCount + (month?.eventCount ?? 0),
    }
  }, { month: monthNumber, rawHours: 0, weightedHours: 0, contractHours: 0, absenceHours: 0, replacementHours: 0, publicHolidayHours: 0, eventCount: 0 })), [visible])
  const periodData = selectedMonth === 'all' ? combined : combined.filter((item) => item.month === selectedMonth)
  const rawTotal = periodData.reduce((sum, item) => sum + item.rawHours, 0)
  const weightedTotal = periodData.reduce((sum, item) => sum + item.weightedHours, 0)
  const eventTotal = periodData.reduce((sum, item) => sum + item.eventCount, 0)
  const calendarsWithoutType = usedCalendars.filter((calendar) => calendar.hourCategory == null).length
  const calendarsWithoutCoefficient = usedCalendars.filter((calendar) => calendar.coefficient == null).length
  const urgentUnassignedEvents = unassignedEvents
    .filter((event) => isEventWithinNextDays(event, new Date(), 7))
    .sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime())

  const synchronize = async () => {
    setSync((state) => ({ ...state, status: 'syncing' }))
    try {
      const result = await runIncrementalSync()
      setSync(result)
      try { setUsedCalendars(await getCoefficientCalendars()) }
      catch { /* The synchronization result remains valid if the status refresh fails. */ }
      try { setUnassignedEvents(await getUnassignedEvents()) }
      catch { /* The synchronization result remains valid if the unassigned-event refresh fails. */ }
    }
    catch { setSync((state) => ({ ...state, status: 'error', message: 'La synchronisation a échoué. Vérifiez la connexion Google.' })) }
  }

  return (
    <div className="page">
      <header className="page-heading">
        <div><p className="eyebrow">Tableau de bord</p><h1>Heures de la cordée</h1><p>Suivi consolidé par saison scolaire, du 1er septembre au 31 août.</p></div>
        {user?.role === 'admin' && <button className="button button--secondary" onClick={() => void synchronize()} disabled={sync.status === 'syncing'}>
          <RefreshCw className={sync.status === 'syncing' ? 'spin' : ''} aria-hidden="true" /> {sync.status === 'syncing' ? 'Synchronisation…' : 'Actualiser Google'}
        </button>}
      </header>
      {sync.message && <div className={`alert ${sync.status === 'error' ? 'alert--error' : 'alert--success'}`} role="status">{sync.message} · {formatSyncDate(sync.lastSyncedAt)}</div>}
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {user?.role === 'admin' && urgentUnassignedEvents.length > 0 && <div className="alert alert--urgent unassigned-warning" role="alert">
        <CircleAlert aria-hidden="true" />
        <span><strong>{urgentUnassignedEvents.length} événement{urgentUnassignedEvents.length > 1 ? 's' : ''} à attribuer dans moins de 7 jours.</strong><small>Le prochain : {urgentUnassignedEvents[0].title} · {formatEventDate(urgentUnassignedEvents[0])}</small></span>
        <Link className="button button--secondary" to="/a-determiner">Voir les événements</Link>
      </div>}
      {user?.role === 'admin' && (calendarsWithoutType > 0 || calendarsWithoutCoefficient > 0) && <div className="alert alert--warning configuration-warning" role="alert">
        <CircleAlert aria-hidden="true" />
        <span><strong>Configuration incomplète.</strong> {calendarsWithoutType > 0 ? `${calendarsWithoutType} type${calendarsWithoutType > 1 ? 's' : ''} d'heures à définir` : ''}{calendarsWithoutType > 0 && calendarsWithoutCoefficient > 0 ? ' et ' : ''}{calendarsWithoutCoefficient > 0 ? `${calendarsWithoutCoefficient} coefficient${calendarsWithoutCoefficient > 1 ? 's' : ''} à définir` : ''}.</span>
        <Link className="button button--secondary" to="/configuration#calendriers-utilises">Configurer les calendriers</Link>
      </div>}

      <section className="filters" aria-label="Filtres du tableau de bord">
        <label><span>Ressource</span><div className="select-wrap"><select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)}><option value="all">Toute l'équipe</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>
        <label><span>Période</span><div className="select-wrap"><select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}><option value="all">Saison complète</option>{combined.map((month) => <option key={month.month} value={month.month}>{monthLabel(month.month)}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>
        <label><span>Saison</span><div className="select-wrap"><select value={schoolYear} onChange={(e) => setSchoolYear(Number(e.target.value))}>{[schoolYear - 1, schoolYear, schoolYear + 1].map((item) => <option key={item} value={item}>{item}–{item + 1}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>
      </section>

      <section className="metric-grid" aria-label="Indicateurs de la période">
        <article className="metric metric--lead"><span className="metric__icon"><TrendingUp aria-hidden="true" /></span><p>Heures pondérées</p><strong>{loading ? '—' : formatHours(weightedTotal)} <small>h</small></strong><span>Après application des coefficients</span></article>
        <article className="metric"><span className="metric__icon"><Clock3 aria-hidden="true" /></span><p>Heures calendrier</p><strong>{loading ? '—' : formatHours(rawTotal)} <small>h</small></strong><span>Durée brute des événements</span></article>
        <article className="metric"><span className="metric__icon"><CalendarDays aria-hidden="true" /></span><p>Événements retenus</p><strong>{loading ? '—' : eventTotal}</strong><span>{visible.length} ressource{visible.length > 1 ? 's' : ''} suivie{visible.length > 1 ? 's' : ''}</span></article>
      </section>

      <section className="panel chart-panel">
        <div className="panel-heading"><div><p className="eyebrow">Progression de la saison {schoolYear}–{schoolYear + 1}</p><h2>Heures pondérées</h2></div><span className="legend"><i /> Total après coefficient</span></div>
        {loading ? <div className="skeleton skeleton--chart" aria-label="Chargement du graphique" /> : <HoursChart data={combined} activeMonth={selectedMonth} />}
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Détail</p><h2>Répartition par salarié</h2></div></div>
        <div className="table-scroll"><table><thead><tr><th>Salarié</th><th>Calendrier</th><th>Heures calendrier</th><th>Heures du contrat</th><th>Heures d'absences</th><th>Heures de remplacements</th><th>Heures fériées</th><th>Heures retenues</th></tr></thead><tbody>{visible.map((employee) => {
          const rows = selectedMonth === 'all' ? employee.monthlyHours : employee.monthlyHours.filter((item) => item.month === selectedMonth)
          const raw = rows.reduce((sum, item) => sum + item.rawHours, 0)
          const weighted = rows.reduce((sum, item) => sum + item.weightedHours, 0)
          const contract = rows.reduce((sum, item) => sum + item.contractHours, 0)
          const absence = rows.reduce((sum, item) => sum + item.absenceHours, 0)
          const replacement = rows.reduce((sum, item) => sum + item.replacementHours, 0)
          const publicHoliday = rows.reduce((sum, item) => sum + item.publicHolidayHours, 0)
          return <tr key={employee.id}><td><strong>{employee.name}</strong></td><td>{employee.calendarName}</td><td>{formatHours(raw)} h</td><td>{formatHours(contract)} h</td><td>{formatHours(absence)} h</td><td>{formatHours(replacement)} h</td><td>{formatHours(publicHoliday)} h</td><td><strong>{formatHours(weighted)} h</strong></td></tr>
        })}</tbody></table></div>
      </section>
    </div>
  )
}
