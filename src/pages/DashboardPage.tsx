import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, BellRing, ChevronDown, CircleAlert, RefreshCw, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatHoursMinutes } from '../lib/annualSummary'
import { contractTypeLabel } from '../lib/contracts'
import { formatSyncDate, monthLabel, schoolYearForDate } from '../lib/format'
import { eventStart, formatEventDate, isEventWithinNextDays } from '../lib/unassignedEvents'
import { buildWorkerRecap } from '../lib/workerRecap'
import { approveTimeMonthChange, getCoefficientCalendars, getEmployeeSummaries, getMonthlyTimeValidations, getUnassignedEvents, runIncrementalSync } from '../services/api'
import type { EmployeeSummary, MonthlyTimeValidation, SyncState, UnassignedEvent, UsedCalendarCoefficient } from '../types'
import { useAuth } from '../context/AuthContext'

const currentSchoolYear = schoolYearForDate(new Date())

function signedHours(hours: number) {
  const sign = hours > 0 ? '+' : hours < 0 ? '−' : ''
  return `${sign}${formatHoursMinutes(Math.abs(hours))} h`
}

export function DashboardPage() {
  const { user } = useAuth()
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear)
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sync, setSync] = useState<SyncState>({ status: 'idle', lastSyncedAt: null })
  const [usedCalendars, setUsedCalendars] = useState<UsedCalendarCoefficient[]>([])
  const [unassignedEvents, setUnassignedEvents] = useState<UnassignedEvent[]>([])
  const [validations, setValidations] = useState<MonthlyTimeValidation[]>([])
  const [approvingValidation, setApprovingValidation] = useState('')
  const [validationError, setValidationError] = useState('')

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
    void getMonthlyTimeValidations().then(setValidations).catch(() => setValidations([]))
  }, [user?.role])

  const workers = useMemo(() => employees.map((employee) => buildWorkerRecap(employee, schoolYear)), [employees, schoolYear])
  const calendarsWithoutType = usedCalendars.filter((calendar) => calendar.hourCategory == null)
  const calendarsWithoutCoefficient = usedCalendars.filter((calendar) => calendar.coefficient == null)
  const urgentUnassignedEvents = unassignedEvents.filter((event) => isEventWithinNextDays(event, new Date(), 7)).sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime())
  const pendingValidationChanges = validations.filter((validation) => validation.status === 'changes_pending')
  const configurationTasks = new Set([...calendarsWithoutType.map((calendar) => calendar.googleCalendarId), ...calendarsWithoutCoefficient.map((calendar) => calendar.googleCalendarId)]).size
  const taskCount = pendingValidationChanges.length + urgentUnassignedEvents.length + configurationTasks

  const synchronize = async () => {
    setSync((state) => ({ ...state, status: 'syncing' }))
    try {
      const result = await runIncrementalSync()
      setSync(result)
      try { setEmployees(await getEmployeeSummaries(schoolYear)) } catch { /* Keep the previous overview. */ }
      try { setUsedCalendars(await getCoefficientCalendars()) } catch { /* Keep the previous tasks. */ }
      try { setUnassignedEvents(await getUnassignedEvents()) } catch { /* Keep the previous tasks. */ }
      try { setValidations(await getMonthlyTimeValidations()) } catch { /* Keep the previous tasks. */ }
    } catch {
      setSync((state) => ({ ...state, status: 'error', message: 'La synchronisation a échoué. Vérifiez la connexion Google.' }))
    }
  }

  const approveValidation = async (validation: MonthlyTimeValidation) => {
    const key = `${validation.employeeId}-${validation.schoolYear}-${validation.month}`
    setApprovingValidation(key)
    setValidationError('')
    try {
      const approved = await approveTimeMonthChange(validation.employeeId, validation.schoolYear, validation.month)
      setValidations((items) => items.map((item) => item.employeeId === approved.employeeId && item.schoolYear === approved.schoolYear && item.month === approved.month ? approved : item))
    } catch {
      setValidationError('La modification n’a pas pu être approuvée. Rechargez la page puis réessayez.')
    } finally {
      setApprovingValidation('')
    }
  }

  return <div className="page overview-page">
    <header className="page-heading overview-heading">
      <div><p className="eyebrow">Vue d’ensemble</p><h1>Toute l’équipe, en un regard</h1><p>Situation annuelle des salariés et indépendants pour la saison du 1er septembre au 31 août.</p></div>
      <div className="overview-heading__actions">
        <label><span>Saison</span><div className="select-wrap"><select aria-label="Saison" value={schoolYear} onChange={(event) => setSchoolYear(Number(event.target.value))}>{[schoolYear - 1, schoolYear, schoolYear + 1].map((year) => <option key={year} value={year}>{year}–{year + 1}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>
        <button className="button button--secondary" onClick={() => void synchronize()} disabled={sync.status === 'syncing'}><RefreshCw className={sync.status === 'syncing' ? 'spin' : ''} aria-hidden="true" />{sync.status === 'syncing' ? 'Synchronisation…' : 'Actualiser Google'}</button>
      </div>
    </header>

    {sync.message && <div className={`alert ${sync.status === 'error' ? 'alert--error' : 'alert--success'}`} role="status">{sync.message} · {formatSyncDate(sync.lastSyncedAt)}</div>}
    {error && <div className="alert alert--error" role="alert">{error}</div>}
    {validationError && <div className="alert alert--error" role="alert">{validationError}</div>}

    <section className={`task-board ${taskCount ? '' : 'task-board--clear'}`} aria-label="Tâches et alertes">
      <header className="task-board__heading"><span className="task-board__icon">{taskCount ? <BellRing aria-hidden="true" /> : <BadgeCheck aria-hidden="true" />}</span><div><h2>À traiter</h2><p>{taskCount ? `${taskCount} tâche${taskCount > 1 ? 's' : ''} demande${taskCount > 1 ? 'nt' : ''} votre attention` : 'Aucune tâche urgente pour le moment'}</p></div></header>
      {taskCount > 0 && <div className="task-board__list">
        {pendingValidationChanges.map((validation) => {
          const employee = employees.find((item) => item.id === validation.employeeId)
          const key = `${validation.employeeId}-${validation.schoolYear}-${validation.month}`
          return <article className="task-item task-item--urgent" key={key}><CircleAlert aria-hidden="true" /><div><strong>Modification d’heures à approuver</strong><span>{employee?.name ?? 'Salarié'} · {monthLabel(validation.month)} {validation.month >= 9 ? validation.schoolYear : validation.schoolYear + 1}</span></div><button className="button button--secondary" type="button" onClick={() => void approveValidation(validation)} disabled={approvingValidation === key}>{approvingValidation === key ? 'Approbation…' : 'Approuver'}</button></article>
        })}
        {urgentUnassignedEvents.map((event) => <article className="task-item task-item--urgent" key={event.id}><CircleAlert aria-hidden="true" /><div><strong>Moniteur à déterminer</strong><span>{event.title} · {formatEventDate(event)}</span></div><Link className="button button--secondary" to="/a-determiner">Attribuer</Link></article>)}
        {configurationTasks > 0 && <article className="task-item task-item--warning"><CircleAlert aria-hidden="true" /><div><strong>Configuration incomplète</strong><span>{calendarsWithoutType.length ? `${calendarsWithoutType.length} type${calendarsWithoutType.length > 1 ? 's' : ''} d’heures à définir` : ''}{calendarsWithoutType.length && calendarsWithoutCoefficient.length ? ' · ' : ''}{calendarsWithoutCoefficient.length ? `${calendarsWithoutCoefficient.length} coefficient${calendarsWithoutCoefficient.length > 1 ? 's' : ''} à définir` : ''}</span></div><Link className="button button--secondary" to="/configuration#calendriers-utilises">Configurer</Link></article>}
      </div>}
    </section>

    <section className="team-overview" aria-labelledby="team-overview-title">
      <div className="team-overview__heading"><div><p className="eyebrow">Saison {schoolYear}–{schoolYear + 1}</p><h2 id="team-overview-title">Salariés et indépendants</h2></div><span><UsersRound aria-hidden="true" />{employees.length} personne{employees.length > 1 ? 's' : ''}</span></div>
      {loading ? <div className="skeleton-list" aria-label="Chargement du récapitulatif"><i /><i /><i /></div> : workers.length === 0 ? <p className="overview-empty">Aucune ressource active pour cette saison.</p> : <div className="worker-list">
        {workers.map(({ employee, contractHours, actualHours, differenceHours, absenceHours, replacementHours, publicHolidayHours }) => {
          const differenceTone = differenceHours == null ? 'neutral' : differenceHours >= 0 ? 'positive' : 'negative'
          const differenceLabel = differenceHours == null ? 'Sans objectif contractuel' : differenceHours >= 0 ? `${signedHours(differenceHours)} au-dessus du contrat` : `${signedHours(differenceHours)} en dessous du contrat`
          return <article className="worker-row" key={employee.id}>
            <div className="worker-identity"><strong>{employee.name}</strong><span>{contractTypeLabel(employee.contractType)}</span></div>
            <div className="worker-value"><span>Contrat annuel</span><strong>{employee.contractType === 'INDEP' ? '—' : `${formatHoursMinutes(contractHours)} h`}</strong></div>
            <div className="worker-value"><span>Heures réelles</span><strong>{formatHoursMinutes(actualHours)} h</strong></div>
            <div className={`worker-difference worker-difference--${differenceTone}`} aria-label={differenceLabel}><span>Écart au contrat</span><strong>{differenceHours == null ? 'Non applicable' : signedHours(differenceHours)}</strong><small>{differenceHours == null ? 'Temps réel' : differenceHours >= 0 ? 'Contrat atteint' : 'Reste à réaliser'}</small></div>
            <div className="worker-details" aria-label={`Détail des heures de ${employee.name}`}><span>Absence <strong>{formatHoursMinutes(absenceHours)} h</strong></span><span>Remplacement <strong>{formatHoursMinutes(replacementHours)} h</strong></span><span>Jours fériés <strong>{formatHoursMinutes(publicHolidayHours)} h</strong></span></div>
          </article>
        })}
      </div>}
    </section>
  </div>
}
