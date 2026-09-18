import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatHoursMinutes } from '../lib/annualSummary'
import { monthLabel, schoolMonths, schoolYearForDate } from '../lib/format'
import { getEmployeeSummaries } from '../services/api'
import type { EmployeeSummary } from '../types'

const currentSchoolYear = schoolYearForDate(new Date())

type MonthlyReportEntry = { employee: EmployeeSummary; absenceHours: number; replacementHours: number }

function calendarYearFor(schoolYear: number, month: number) {
  return month >= 9 ? schoolYear : schoolYear + 1
}

export function ReplacementAbsencePage() {
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear)
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setEmployees([])
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

  const reportsByMonth = useMemo(() => schoolMonths.map((month) => {
    const entries: MonthlyReportEntry[] = employees.flatMap((employee) => {
      const hours = employee.monthlyHours.find((item) => item.month === month)
      const absenceHours = hours?.absenceHours ?? 0
      const replacementHours = hours?.replacementHours ?? 0
      return absenceHours > 0 || replacementHours > 0 ? [{ employee, absenceHours, replacementHours }] : []
    })
    return { month, entries }
  }).filter(({ entries }) => entries.length > 0), [employees])

  return <div className="page replacement-absence-page">
    <header className="page-heading">
      <div><p className="eyebrow">Administration</p><h1>Absences et remplacements</h1><p>Consultez chaque mois, puis les moniteurs concernés et leurs heures. Les heures incluent le coefficient de préparation.</p></div>
      <label className="season-select"><span>Saison</span><div className="select-wrap"><select aria-label="Saison" value={schoolYear} onChange={(event) => setSchoolYear(Number(event.target.value))}>{[schoolYear - 1, schoolYear, schoolYear + 1].map((year) => <option key={year} value={year}>{year}–{year + 1}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>
    </header>

    {error && <div className="alert alert--error" role="alert">{error}</div>}
    {loading ? <div className="skeleton-list" aria-label="Chargement du récapitulatif"><i /><i /><i /></div> : reportsByMonth.length === 0 ? <p className="overview-empty">Aucune absence ni aucun remplacement pour cette saison.</p> : <div className="replacement-absence-months">{reportsByMonth.map(({ month, entries }) => {
      const absenceTotal = entries.reduce((total, entry) => total + entry.absenceHours, 0)
      const replacementTotal = entries.reduce((total, entry) => total + entry.replacementHours, 0)
      const titleId = `replacement-absence-month-${month}`
      return <section className="replacement-absence-month" aria-labelledby={titleId} key={month}>
        <header className="replacement-absence-month__heading"><div><p className="eyebrow">{monthLabel(month)} {calendarYearFor(schoolYear, month)}</p><h2 id={titleId}>{monthLabel(month)}</h2></div><div className="replacement-absence-month__totals"><span>{entries.length} moniteur{entries.length > 1 ? 's' : ''}</span>{absenceTotal > 0 && <strong className="replacement-absence-value replacement-absence-value--absence">Absences · {formatHoursMinutes(absenceTotal)}</strong>}{replacementTotal > 0 && <strong className="replacement-absence-value replacement-absence-value--replacement">Remplacements · {formatHoursMinutes(replacementTotal)}</strong>}</div></header>
        <ul className="replacement-absence-list">{entries.map(({ employee, absenceHours, replacementHours }) => <li key={employee.id}><strong>{employee.name}</strong><div className="replacement-absence-values">{absenceHours > 0 && <span className="replacement-absence-value replacement-absence-value--absence">Absence <b>{formatHoursMinutes(absenceHours)}</b></span>}{replacementHours > 0 && <span className="replacement-absence-value replacement-absence-value--replacement">Remplacement <b>{formatHoursMinutes(replacementHours)}</b></span>}</div></li>)}</ul>
      </section>
    })}</div>}
  </div>
}
