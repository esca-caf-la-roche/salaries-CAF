import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, UsersRound } from 'lucide-react'
import { formatHoursMinutes } from '../lib/annualSummary'
import { monthLabel, schoolMonths, schoolYearForDate } from '../lib/format'
import { getEmployeeSummaries } from '../services/api'
import type { EmployeeSummary, MonthlyHours } from '../types'

const currentSchoolYear = schoolYearForDate(new Date())

function totalFor(employee: EmployeeSummary, key: 'absenceHours' | 'replacementHours') {
  return employee.monthlyHours.reduce((total, month) => total + month[key], 0)
}

function hoursFor(employee: EmployeeSummary, month: number): MonthlyHours | undefined {
  return employee.monthlyHours.find((item) => item.month === month)
}

function AnnualRow({ employee, label, field, tone }: {
  employee: EmployeeSummary
  label: string
  field: 'absenceHours' | 'replacementHours'
  tone: 'absence' | 'replacement'
}) {
  return <tr className={`annual-row annual-row--${tone}`}>
    <th scope="row">{employee.name} · {label}</th>
    {schoolMonths.map((month) => <td key={month} data-label={monthLabel(month)}>{formatHoursMinutes(hoursFor(employee, month)?.[field] ?? 0)}</td>)}
    <td data-label="Total"><strong>{formatHoursMinutes(totalFor(employee, field))}</strong></td>
  </tr>
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

  const totals = useMemo(() => employees.reduce((summary, employee) => ({
    absence: summary.absence + totalFor(employee, 'absenceHours'),
    replacement: summary.replacement + totalFor(employee, 'replacementHours'),
  }), { absence: 0, replacement: 0 }), [employees])

  return <div className="page replacement-absence-page">
    <header className="page-heading">
      <div><p className="eyebrow">Administration</p><h1>Absences et remplacements</h1><p>Lecture complète de la saison, par salarié et par mois. Les heures incluent le coefficient de préparation.</p></div>
      <label className="season-select"><span>Saison</span><div className="select-wrap"><select aria-label="Saison" value={schoolYear} onChange={(event) => setSchoolYear(Number(event.target.value))}>{[schoolYear - 1, schoolYear, schoolYear + 1].map((year) => <option key={year} value={year}>{year}–{year + 1}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>
    </header>

    {error && <div className="alert alert--error" role="alert">{error}</div>}
    <section className="annual-scoreboard replacement-absence-summary" aria-label="Totaux de la saison">
      <article><span>Absences</span><strong>{formatHoursMinutes(totals.absence)}</strong><small>Total sur la saison</small></article>
      <article><span>Remplacements</span><strong>{formatHoursMinutes(totals.replacement)}</strong><small>Total sur la saison</small></article>
      <article><span>Intervenants</span><strong>{employees.length}</strong><small>Hors indépendants</small></article>
    </section>

    <section className="panel annual-sheet replacement-absence-sheet" aria-labelledby="replacement-absence-title">
      <div className="panel-heading"><div><p className="eyebrow">Saison {schoolYear}–{schoolYear + 1}</p><h2 id="replacement-absence-title">Détail mensuel par salarié</h2></div><span className="contract-badge"><UsersRound aria-hidden="true" /> {employees.length} intervenant{employees.length > 1 ? 's' : ''}</span></div>
      {loading ? <div className="skeleton-list" aria-label="Chargement du récapitulatif"><i /><i /><i /></div> : employees.length === 0 ? <p className="overview-empty">Aucun salarié actif pour cette saison.</p> : <div className="annual-table-scroll"><table><thead><tr><th>Désignation</th>{schoolMonths.map((month) => <th key={month}>{monthLabel(month)}</th>)}<th>Total</th></tr></thead><tbody>{employees.flatMap((employee) => [
        <AnnualRow key={`${employee.id}-absence`} employee={employee} label="Absences" field="absenceHours" tone="absence" />,
        <AnnualRow key={`${employee.id}-replacement`} employee={employee} label="Remplacements" field="replacementHours" tone="replacement" />,
      ])}</tbody></table></div>}
    </section>
  </div>
}
