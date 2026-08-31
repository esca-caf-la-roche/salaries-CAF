import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, Clock3, RefreshCw, TrendingUp } from 'lucide-react'
import { HoursChart } from '../components/HoursChart'
import { formatHours, formatSyncDate, monthLabel } from '../lib/format'
import { getEmployeeSummaries, runIncrementalSync } from '../services/api'
import type { EmployeeSummary, SyncState } from '../types'
import { useAuth } from '../context/AuthContext'

const currentDate = new Date()

export function DashboardPage() {
  const { user } = useAuth()
  const [year, setYear] = useState(currentDate.getFullYear())
  const [selectedEmployee, setSelectedEmployee] = useState('all')
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(currentDate.getMonth() + 1)
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sync, setSync] = useState<SyncState>({ status: 'idle', lastSyncedAt: null })

  useEffect(() => {
    setLoading(true)
    setError('')
    void getEmployeeSummaries(year)
      .then(setEmployees)
      .catch(() => setError('Les heures n\'ont pas pu être chargées. Relancez la page.'))
      .finally(() => setLoading(false))
  }, [year])

  const visible = useMemo(() => selectedEmployee === 'all' ? employees : employees.filter((item) => item.id === selectedEmployee), [employees, selectedEmployee])
  const combined = useMemo(() => Array.from({ length: 12 }, (_, index) => visible.reduce((total, employee) => {
    const month = employee.monthlyHours.find((item) => item.month === index + 1)
    return {
      month: index + 1,
      rawHours: total.rawHours + (month?.rawHours ?? 0),
      weightedHours: total.weightedHours + (month?.weightedHours ?? 0),
      eventCount: total.eventCount + (month?.eventCount ?? 0),
    }
  }, { month: index + 1, rawHours: 0, weightedHours: 0, eventCount: 0 })), [visible])
  const periodData = selectedMonth === 'all' ? combined : combined.filter((item) => item.month === selectedMonth)
  const rawTotal = periodData.reduce((sum, item) => sum + item.rawHours, 0)
  const weightedTotal = periodData.reduce((sum, item) => sum + item.weightedHours, 0)
  const eventTotal = periodData.reduce((sum, item) => sum + item.eventCount, 0)

  const synchronize = async () => {
    setSync((state) => ({ ...state, status: 'syncing' }))
    try { setSync(await runIncrementalSync()) }
    catch { setSync((state) => ({ ...state, status: 'error', message: 'La synchronisation a échoué. Vérifiez la connexion Google.' })) }
  }

  return (
    <div className="page">
      <header className="page-heading">
        <div><p className="eyebrow">Tableau de bord</p><h1>Heures de la cordée</h1><p>Suivi consolidé des calendriers actifs et des coefficients appliqués.</p></div>
        {user?.role === 'admin' && <button className="button button--secondary" onClick={() => void synchronize()} disabled={sync.status === 'syncing'}>
          <RefreshCw className={sync.status === 'syncing' ? 'spin' : ''} aria-hidden="true" /> {sync.status === 'syncing' ? 'Synchronisation…' : 'Actualiser Google'}
        </button>}
      </header>
      {sync.message && <div className={`alert ${sync.status === 'error' ? 'alert--error' : 'alert--success'}`} role="status">{sync.message} · {formatSyncDate(sync.lastSyncedAt)}</div>}
      {error && <div className="alert alert--error" role="alert">{error}</div>}

      <section className="filters" aria-label="Filtres du tableau de bord">
        <label><span>Ressource</span><div className="select-wrap"><select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)}><option value="all">Toute l'équipe</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>
        <label><span>Période</span><div className="select-wrap"><select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}><option value="all">Année complète</option>{combined.map((month) => <option key={month.month} value={month.month}>{monthLabel(month.month)}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>
        <label><span>Année</span><div className="select-wrap"><select value={year} onChange={(e) => setYear(Number(e.target.value))}>{[year - 1, year, year + 1].map((item) => <option key={item}>{item}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>
      </section>

      <section className="metric-grid" aria-label="Indicateurs de la période">
        <article className="metric metric--lead"><span className="metric__icon"><TrendingUp aria-hidden="true" /></span><p>Heures pondérées</p><strong>{loading ? '—' : formatHours(weightedTotal)} <small>h</small></strong><span>Après application des coefficients</span></article>
        <article className="metric"><span className="metric__icon"><Clock3 aria-hidden="true" /></span><p>Heures calendrier</p><strong>{loading ? '—' : formatHours(rawTotal)} <small>h</small></strong><span>Durée brute des événements</span></article>
        <article className="metric"><span className="metric__icon"><CalendarDays aria-hidden="true" /></span><p>Événements retenus</p><strong>{loading ? '—' : eventTotal}</strong><span>{visible.length} ressource{visible.length > 1 ? 's' : ''} suivie{visible.length > 1 ? 's' : ''}</span></article>
      </section>

      <section className="panel chart-panel">
        <div className="panel-heading"><div><p className="eyebrow">Progression annuelle</p><h2>Heures pondérées</h2></div><span className="legend"><i /> Total après coefficient</span></div>
        {loading ? <div className="skeleton skeleton--chart" aria-label="Chargement du graphique" /> : <HoursChart data={combined} activeMonth={selectedMonth} />}
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Détail</p><h2>Répartition par salarié</h2></div></div>
        <div className="table-scroll"><table><thead><tr><th>Salarié</th><th>Calendrier</th><th>Heures calendrier</th><th>Coefficient appliqué</th><th>Heures retenues</th></tr></thead><tbody>{visible.map((employee) => {
          const rows = selectedMonth === 'all' ? employee.monthlyHours : employee.monthlyHours.filter((item) => item.month === selectedMonth)
          const raw = rows.reduce((sum, item) => sum + item.rawHours, 0)
          const weighted = rows.reduce((sum, item) => sum + item.weightedHours, 0)
          const coefficient = raw ? weighted / raw : 1
          return <tr key={employee.id}><td><strong>{employee.name}</strong></td><td>{employee.calendarName}</td><td>{formatHours(raw)} h</td><td><span className="coefficient">× {formatHours(coefficient)}</span></td><td><strong>{formatHours(weighted)} h</strong></td></tr>
        })}</tbody></table></div>
      </section>
    </div>
  )
}
