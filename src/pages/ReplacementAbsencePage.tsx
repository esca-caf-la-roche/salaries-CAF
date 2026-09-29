import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Copy, RotateCcw } from 'lucide-react'
import { formatHoursMinutes } from '../lib/annualSummary'
import { buildAbsenceMonthReport, eventClockLabel, eventSlotLabel, splitByCategory, sumWeightedHours, type AbsenceMonthMonitor } from '../lib/absenceReport'
import { calendarYearFor, monthLabel, schoolMonths, schoolYearForDate } from '../lib/format'
import { getEmployeeSummaries, getMonthlyEventHours } from '../services/api'
import type { EmployeeSummary, MonthlyEventHour } from '../types'

const currentSchoolYear = schoolYearForDate(new Date())

type MonthlyReportEntry = { employee: EmployeeSummary; absenceHours: number; replacementHours: number }
type DetailStatus = 'loading' | 'ready' | 'error'
type CopyState = { state: 'copying' | 'done' | 'error'; reason?: 'load' | 'mismatch' | 'clipboard' }

/**
 * monthly_hours arrondit la somme des créneaux à 2 décimales : l'arrondi seul vaut au plus 0,005 h.
 * Au-delà de 6 millièmes d'heure, l'écart entre le détail et le total est réel (créneau manquant ou en trop).
 */
const DETAIL_TOLERANCE = 0.006

const detailKey = (schoolYear: number, employeeId: string, month: number) => `${schoolYear}:${employeeId}:${month}`

function DetailGroup({ kind, employeeName, events, monthlyTotal }: { kind: 'absence' | 'replacement'; employeeName: string; events: MonthlyEventHour[]; monthlyTotal: number }) {
  const label = kind === 'absence' ? 'Absences' : 'Remplacements'
  const total = sumWeightedHours(events)
  return <section className={`replacement-absence-group replacement-absence-group--${kind}`} aria-label={`${label} de ${employeeName}`}>
    <header className="replacement-absence-group__heading"><h3>{label}</h3><b>{`Total ${formatHoursMinutes(total)}`}</b></header>
    {events.length === 0
      ? <p className="replacement-absence-group__empty">Aucun créneau détaillé ce mois-ci{monthlyTotal > 0 ? ` · total mensuel ${formatHoursMinutes(monthlyTotal)}` : ''}.</p>
      : <ul>{events.map((event) => <li key={event.id}><time dateTime={event.startsAt}>{eventSlotLabel(event)}</time><span className="replacement-absence-group__title">{event.title}</span><span className="replacement-absence-group__hours">{eventClockLabel(event)}</span></li>)}</ul>}
  </section>
}

export function ReplacementAbsencePage() {
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear)
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detailStatus, setDetailStatus] = useState<Record<string, DetailStatus>>({})
  const [openedPanels, setOpenedPanels] = useState<string[]>([])
  const [copyStates, setCopyStates] = useState<Record<number, CopyState>>({})
  const detailCache = useRef(new Map<string, MonthlyEventHour[]>())
  const pendingDetails = useRef(new Map<string, { id: symbol; promise: Promise<MonthlyEventHour[]> }>())
  const seasonRef = useRef(currentSchoolYear)

  useEffect(() => {
    let active = true
    seasonRef.current = schoolYear
    setLoading(true)
    setError('')
    setEmployees([])
    setDetailStatus({})
    setOpenedPanels([])
    setCopyStates({})
    detailCache.current.clear()
    pendingDetails.current.clear()
    void getEmployeeSummaries(schoolYear)
      .then((items) => {
        if (active) setEmployees(items.filter((employee) => employee.contractType !== 'INDEP'))
      })
      .catch(() => {
        if (active) setError('Le récapitulatif des absences et remplacements n’a pas pu être chargé.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [schoolYear])

  useEffect(() => {
    const copiedMonths = Object.entries(copyStates)
      .filter(([, state]) => state.state === 'done')
      .map(([month]) => Number(month))
    if (copiedMonths.length === 0) return
    const timer = setTimeout(() => setCopyStates((current) => {
      const next = { ...current }
      for (const month of copiedMonths) if (next[month]?.state === 'done') delete next[month]
      return next
    }), 3000)
    return () => clearTimeout(timer)
  }, [copyStates])

  const loadDetail = useCallback((employeeId: string, month: number) => {
    const key = detailKey(schoolYear, employeeId, month)
    const cached = detailCache.current.get(key)
    if (cached) return Promise.resolve(cached)
    const pending = pendingDetails.current.get(key)
    if (pending) return pending.promise
    const season = schoolYear
    const requestId = Symbol(key)
    setDetailStatus((status) => ({ ...status, [key]: 'loading' }))
    const promise = getMonthlyEventHours(employeeId, season, month)
      .then((events) => {
        if (seasonRef.current === season) {
          detailCache.current.set(key, events)
          setDetailStatus((status) => ({ ...status, [key]: 'ready' }))
        }
        return events
      })
      .catch((failure: unknown) => {
        if (seasonRef.current === season) setDetailStatus((status) => ({ ...status, [key]: 'error' }))
        throw failure
      })
      .finally(() => {
        if (pendingDetails.current.get(key)?.id === requestId) pendingDetails.current.delete(key)
      })
    pendingDetails.current.set(key, { id: requestId, promise })
    return promise
  }, [schoolYear])

  /** Après un écart, on recharge le détail du mois pour vérifier si l'écart vient des données ou du cache. */
  const reloadMonthDetails = (month: number, monthEntries: MonthlyReportEntry[]) => {
    for (const entry of monthEntries) {
      const key = detailKey(schoolYear, entry.employee.id, month)
      detailCache.current.delete(key)
      pendingDetails.current.delete(key)
      setDetailStatus((status) => {
        if (!(key in status)) return status
        const next = { ...status }
        delete next[key]
        return next
      })
      void loadDetail(entry.employee.id, month).catch(() => {})
    }
  }

  const setCopyState = (month: number, state: CopyState) => setCopyStates((current) => ({ ...current, [month]: state }))

  const toggleMonitor = (panelId: string, employeeId: string, month: number, open: boolean) => {
    setOpenedPanels((current) => open
      ? (current.includes(panelId) ? current : [...current, panelId])
      : current.filter((id) => id !== panelId))
    if (open) void loadDetail(employeeId, month).catch(() => {})
  }

  const copyMonth = async (month: number, monthEntries: MonthlyReportEntry[]) => {
    const season = schoolYear
    setCopyState(month, { state: 'copying' })
    let monitors: AbsenceMonthMonitor[]
    try {
      monitors = await Promise.all(monthEntries.map(async (entry) => ({ employee: entry.employee, events: await loadDetail(entry.employee.id, month) })))
    } catch {
      if (seasonRef.current === season) setCopyState(month, { state: 'error', reason: 'load' })
      return
    }
    if (seasonRef.current !== season) return
    const inconsistent = monthEntries.some((entry, index) => {
      const { absences, replacements } = splitByCategory(monitors[index].events)
      return Math.abs(sumWeightedHours(absences) - entry.absenceHours) > DETAIL_TOLERANCE
        || Math.abs(sumWeightedHours(replacements) - entry.replacementHours) > DETAIL_TOLERANCE
    })
    if (inconsistent) {
      setCopyState(month, { state: 'error', reason: 'mismatch' })
      reloadMonthDetails(month, monthEntries)
      return
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Presse-papier indisponible')
      await navigator.clipboard.writeText(buildAbsenceMonthReport(season, month, monitors))
    } catch {
      if (seasonRef.current === season) setCopyState(month, { state: 'error', reason: 'clipboard' })
      return
    }
    if (seasonRef.current === season) setCopyState(month, { state: 'done' })
  }

  const reportsByMonth = useMemo(() => schoolMonths.map((month) => {
    const entries: MonthlyReportEntry[] = employees.flatMap((employee) => {
      const hours = employee.monthlyHours.find((item) => item.month === month)
      const absenceHours = hours?.absenceHours ?? 0
      const replacementHours = hours?.replacementHours ?? 0
      return absenceHours > 0 || replacementHours > 0 ? [{ employee, absenceHours, replacementHours }] : []
    })
    return { month, entries }
  }).filter(({ entries }) => entries.length > 0), [employees])

  const renderDetail = (key: string, entry: MonthlyReportEntry, month: number): ReactNode => {
    const status = detailStatus[key]
    if (status === 'error') return <div className="replacement-absence-detail__error"><p role="alert">Le détail des créneaux n’a pas pu être chargé.</p><button type="button" className="button button--secondary" onClick={() => void loadDetail(entry.employee.id, month).catch(() => {})}><RotateCcw aria-hidden="true" />Réessayer</button></div>
    if (status !== 'ready') return <p className="replacement-absence-detail__note">Chargement du détail des créneaux…</p>
    const { absences, replacements } = splitByCategory(detailCache.current.get(key) ?? [])
    return <>
      <DetailGroup kind="absence" employeeName={entry.employee.name} events={absences} monthlyTotal={entry.absenceHours} />
      <DetailGroup kind="replacement" employeeName={entry.employee.name} events={replacements} monthlyTotal={entry.replacementHours} />
    </>
  }

  return <div className="page replacement-absence-page">
    <header className="page-heading">
      <div><p className="eyebrow">Administration</p><h1>Absences et remplacements</h1><p>Consultez chaque mois, puis les moniteurs concernés et, pour chacun, le détail des créneaux d’absence et de remplacement. Les heures incluent le coefficient de préparation.</p></div>
      <label className="season-select"><span>Saison</span><div className="select-wrap"><select aria-label="Saison" value={schoolYear} onChange={(event) => setSchoolYear(Number(event.target.value))}>{[schoolYear - 1, schoolYear, schoolYear + 1].map((year) => <option key={year} value={year}>{year}–{year + 1}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>
    </header>

    {error && <div className="alert alert--error" role="alert">{error}</div>}
    {loading ? <div className="skeleton-list" aria-label="Chargement du récapitulatif"><i /><i /><i /></div> : reportsByMonth.length === 0 ? <p className="overview-empty">Aucune absence ni aucun remplacement pour cette saison.</p> : <div className="replacement-absence-months">{reportsByMonth.map(({ month, entries }) => {
      const absenceTotal = entries.reduce((total, entry) => total + entry.absenceHours, 0)
      const replacementTotal = entries.reduce((total, entry) => total + entry.replacementHours, 0)
      const titleId = `replacement-absence-month-${month}`
      const copyState = copyStates[month]
      const copying = copyState?.state === 'copying'
      const copied = copyState?.state === 'done'
      const copyFailed = copyState?.state === 'error'
      const copyMessage = copyState?.reason === 'mismatch'
        ? 'Copie impossible : le détail ne correspond pas aux totaux du mois.'
        : copyState?.reason === 'clipboard'
          ? 'Copie impossible : presse-papier indisponible.'
          : 'Copie impossible : détail non chargé.'
      return <section className="replacement-absence-month" aria-labelledby={titleId} key={month}>
        <header className="replacement-absence-month__heading">
          <div><p className="eyebrow">{monthLabel(month)} {calendarYearFor(schoolYear, month)}</p><h2 id={titleId}>{monthLabel(month)}</h2></div>
          <div className="replacement-absence-month__actions">
            <div className="replacement-absence-month__totals"><span>{entries.length} moniteur{entries.length > 1 ? 's' : ''}</span>{absenceTotal > 0 && <strong className="replacement-absence-value replacement-absence-value--absence">Absences · {formatHoursMinutes(absenceTotal)}</strong>}{replacementTotal > 0 && <strong className="replacement-absence-value replacement-absence-value--replacement">Remplacements · {formatHoursMinutes(replacementTotal)}</strong>}</div>
            <button type="button" className="button button--secondary" onClick={() => void copyMonth(month, entries)} disabled={copying}><Copy aria-hidden="true" />{copying ? 'Copie…' : 'Copier le mois'}</button>
            <span className="replacement-absence-copy-status" role="status">{copied ? 'Mois copié' : copying ? 'Copie en cours…' : ''}</span>
            {copyFailed && <span className="replacement-absence-copy-status replacement-absence-copy-status--error" role="alert">{copyMessage}</span>}
          </div>
        </header>
        <ul className="replacement-absence-list">{entries.map((entry) => {
          const { employee, absenceHours, replacementHours } = entry
          const key = detailKey(schoolYear, employee.id, month)
          const panelId = `replacement-absence-detail-${schoolYear}-${month}-${employee.id}`
          const open = openedPanels.includes(panelId)
          return <li key={employee.id}>
            <button type="button" className="replacement-absence-monitor" aria-expanded={open} aria-controls={panelId} onClick={() => toggleMonitor(panelId, employee.id, month, !open)}>
              <strong>{employee.name}</strong>
              <span className="replacement-absence-values">{absenceHours > 0 && <span className="replacement-absence-value replacement-absence-value--absence">Absence <b>{formatHoursMinutes(absenceHours)}</b></span>}{replacementHours > 0 && <span className="replacement-absence-value replacement-absence-value--replacement">Remplacement <b>{formatHoursMinutes(replacementHours)}</b></span>}</span>
              <ChevronDown aria-hidden="true" />
            </button>
            <div className="replacement-absence-detail" id={panelId} hidden={!open}>{open && renderDetail(key, entry, month)}</div>
          </li>
        })}</ul>
      </section>
    })}</div>}
  </div>
}
