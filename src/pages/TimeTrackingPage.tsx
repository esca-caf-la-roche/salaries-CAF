import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, ClipboardCheck, Save, Sigma } from 'lucide-react'
import {
  calculateAnnualSummary,
  countWeekdayFrenchPublicHolidaysForSchoolSeason,
  formatHoursMinutes,
} from '../lib/annualSummary'
import { monthLabel, schoolMonths, schoolYearForDate } from '../lib/format'
import { getEmployeeSummaries, getMonthlyEventHours, saveAnnualTracking } from '../services/api'
import type { EmployeeSummary, MonthlyEventHour, MonthlyHours, MonthlyPayrollEntry, SchoolYearSettings } from '../types'
import { useAuth } from '../context/AuthContext'

const now = new Date()
const currentSchoolYear = schoolYearForDate(now)
const emptyMonth = (month: number): MonthlyHours => ({
  month, rawHours: 0, weightedHours: 0, contractHours: 0, absenceHours: 0,
  replacementHours: 0, publicHolidayHours: 0, contractWithPrepHours: 0,
  contractWithoutPrepHours: 0, absenceWithPrepHours: 0, absenceWithoutPrepHours: 0,
  replacementWithPrepHours: 0, replacementWithoutPrepHours: 0, publicHolidayWithPrepHours: 0,
  publicHolidayWithoutPrepHours: 0, workedWeeks: 0, eventCount: 0,
})

const categoryLabels = {
  contract: 'Heures du contrat',
  absence: 'Absence',
  replacement: 'Remplacement',
  public_holiday: 'Jour férié',
}

function parseDuration(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return 0
  const clock = normalized.match(/^(\d+):([0-5]\d)$/)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])
  const decimal = Number(normalized)
  return Number.isFinite(decimal) && decimal >= 0 ? Math.round(decimal * 60) : null
}

function eventTime(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function eventDate(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(iso))
}

export function TimeTrackingPage() {
  const { user } = useAuth()
  const canEdit = user?.role === 'admin'
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [view, setView] = useState<'monthly' | 'annual'>('monthly')
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [events, setEvents] = useState<MonthlyEventHour[]>([])
  const [loading, setLoading] = useState(true)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState({ annual: '', fullTime: '', paidMonths: '12' })
  const [payrollDraft, setPayrollDraft] = useState<Record<number, { paid: string; leave: string }>>({})

  useEffect(() => {
    setLoading(true)
    setError('')
    void getEmployeeSummaries(schoolYear)
      .then((items) => {
        setEmployees(items)
        setSelectedEmployeeId((current) => items.some((item) => item.id === current) ? current : (items[0]?.id ?? ''))
      })
      .catch(() => setError('Le suivi des heures n’a pas pu être chargé.'))
      .finally(() => setLoading(false))
  }, [schoolYear])

  const employee = employees.find((item) => item.id === selectedEmployeeId)
  const months = useMemo(() => schoolMonths.map((month) => employee?.monthlyHours.find((item) => item.month === month) ?? emptyMonth(month)), [employee])

  useEffect(() => {
    if (!employee) return
    setSettingsDraft({
      annual: formatHoursMinutes(employee.settings.annualContractMinutes / 60),
      fullTime: formatHoursMinutes(employee.settings.fullTimeAnnualMinutes / 60),
      paidMonths: String(employee.settings.paidMonths),
    })
    setPayrollDraft(Object.fromEntries(schoolMonths.map((month) => {
      const entry = employee.payroll.find((item) => item.month === month)
      return [month, {
        paid: formatHoursMinutes((entry?.paidMinutes ?? 0) / 60),
        leave: formatHoursMinutes((entry?.paidLeaveMinutes ?? 0) / 60),
      }]
    })))
  }, [employee])

  useEffect(() => {
    if (!employee || view !== 'monthly') return
    setEvents([])
    setEventsLoading(true)
    void getMonthlyEventHours(employee.id, schoolYear, selectedMonth)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false))
  }, [employee, schoolYear, selectedMonth, view])

  const totals = useMemo(() => months.reduce((sum, month) => ({
    contract: sum.contract + month.contractHours,
    absence: sum.absence + month.absenceHours,
    replacement: sum.replacement + month.replacementHours,
    holiday: sum.holiday + month.publicHolidayHours,
  }), { contract: 0, absence: 0, replacement: 0, holiday: 0 }), [months])

  const payrollEntries = useMemo<MonthlyPayrollEntry[]>(() => schoolMonths.map((month) => ({
    month,
    paidMinutes: parseDuration(payrollDraft[month]?.paid ?? '') ?? 0,
    paidLeaveMinutes: parseDuration(payrollDraft[month]?.leave ?? '') ?? 0,
  })), [payrollDraft])
  const payslipHours = payrollEntries.reduce((sum, entry) => sum + entry.paidMinutes, 0) / 60
  const payslipLeaveHours = payrollEntries.reduce((sum, entry) => sum + entry.paidLeaveMinutes, 0) / 60
  const annualMinutes = parseDuration(settingsDraft.annual)
  const fullTimeMinutes = parseDuration(settingsDraft.fullTime)
  const paidMonths = Number(settingsDraft.paidMonths)
  const validDraft = annualMinutes != null && annualMinutes > 0 && fullTimeMinutes != null && fullTimeMinutes > 0
    && Number.isInteger(paidMonths) && paidMonths >= 1 && paidMonths <= 12
    && schoolMonths.every((month) => parseDuration(payrollDraft[month]?.paid ?? '') != null && parseDuration(payrollDraft[month]?.leave ?? '') != null)

  const annual = employee && validDraft ? calculateAnnualSummary({
    contractType: employee.contractType,
    annualContractHours: annualMinutes / 60,
    calendarContractHours: totals.contract,
    calendarAbsenceHours: totals.absence,
    calendarReplacementHours: totals.replacement,
    calendarPublicHolidayHours: totals.holiday,
    payslipHours,
    payslipPaidLeaveHours: payslipLeaveHours,
    schoolSeason: { startYear: schoolYear },
    fullTimeAnnualHours: fullTimeMinutes / 60,
  }) : null

  const save = async () => {
    if (!employee || !validDraft || annualMinutes == null || fullTimeMinutes == null) {
      setSaveMessage('Corrigez les durées : utilisez HH:MM ou des heures décimales positives.')
      return
    }
    const settings: SchoolYearSettings = {
      contractType: employee.contractType,
      annualContractMinutes: annualMinutes,
      fullTimeAnnualMinutes: fullTimeMinutes,
      paidMonths,
    }
    setSaving(true)
    setSaveMessage('')
    try {
      await saveAnnualTracking(employee.id, schoolYear, settings, payrollEntries)
      setEmployees((items) => items.map((item) => item.id === employee.id ? {
        ...item,
        annualContractHours: annualMinutes / 60,
        settings,
        payroll: payrollEntries,
      } : item))
      setSaveMessage('Suivi de la saison enregistré.')
    } catch {
      setSaveMessage('L’enregistrement a échoué. Vérifiez vos droits puis réessayez.')
    } finally {
      setSaving(false)
    }
  }

  const monthData = months.find((item) => item.month === selectedMonth) ?? emptyMonth(selectedMonth)
  const monthlyRetained = monthData.contractHours + monthData.absenceHours + monthData.replacementHours + monthData.publicHolidayHours

  return (
    <div className="page tracking-page">
      <header className="page-heading">
        <div><p className="eyebrow">Suivi des salariés</p><h1>Du calendrier au bulletin</h1><p>Contrôlez chaque mois, puis régularisez la saison de septembre à août sans perdre le détail des heures.</p></div>
        {canEdit && view === 'annual' && <button className="button button--primary" onClick={() => void save()} disabled={saving || !employee}><Save aria-hidden="true" />{saving ? 'Enregistrement…' : 'Enregistrer la saison'}</button>}
      </header>

      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {saveMessage && <div className={`alert ${saveMessage.includes('enregistré') ? 'alert--success' : 'alert--warning'}`} role="status">{saveMessage}</div>}

      <section className="filters tracking-filters" aria-label="Filtres du suivi">
        <label><span>Salarié</span><div className="select-wrap"><select value={selectedEmployeeId} onChange={(event) => { setSelectedEmployeeId(event.target.value); setSaveMessage('') }} disabled={loading}><option value="">Sélectionner</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.contractType}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>
        <label><span>Saison</span><div className="select-wrap"><select value={schoolYear} onChange={(event) => setSchoolYear(Number(event.target.value))}>{[currentSchoolYear - 2, currentSchoolYear - 1, currentSchoolYear, currentSchoolYear + 1].map((year) => <option key={year} value={year}>{year}–{year + 1}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>
        {view === 'monthly' && <label><span>Mois</span><div className="select-wrap"><select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>{schoolMonths.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>}
      </section>

      <div className="view-tabs" role="tablist" aria-label="Type de suivi">
        <button role="tab" aria-selected={view === 'monthly'} onClick={() => setView('monthly')}><CalendarDays aria-hidden="true" />Détail mensuel</button>
        <button role="tab" aria-selected={view === 'annual'} onClick={() => setView('annual')}><Sigma aria-hidden="true" />Synthèse annuelle</button>
      </div>

      {!loading && !employee && <section className="panel tracking-empty"><ClipboardCheck aria-hidden="true" /><h2>Aucun salarié configuré</h2><p>Activez une ressource et renseignez son contrat dans Configuration.</p></section>}

      {employee && view === 'monthly' && <>
        <section className="metric-grid tracking-metrics" aria-label="Totaux du mois">
          <article className="metric metric--lead"><p>Heures retenues</p><strong>{formatHoursMinutes(monthlyRetained)} <small>h</small></strong><span>{monthData.eventCount} événement{monthData.eventCount > 1 ? 's' : ''} configuré{monthData.eventCount > 1 ? 's' : ''}</span></article>
          <article className="metric"><p>Contrat</p><strong>{formatHoursMinutes(monthData.contractHours)} <small>h</small></strong><span>Avec et sans préparation</span></article>
          <article className="metric"><p>Absences</p><strong>{formatHoursMinutes(monthData.absenceHours)} <small>h</small></strong><span>Total des heures d’absence</span></article>
          <article className="metric"><p>Remplacements</p><strong>{formatHoursMinutes(monthData.replacementHours)} <small>h</small></strong><span>À payer en plus du contrat</span></article>
          <article className="metric"><p>Fériés</p><strong>{formatHoursMinutes(monthData.publicHolidayHours)} <small>h</small></strong><span>Total des heures fériées</span></article>
        </section>
        <section className="panel monthly-ledger">
          <div className="panel-heading"><div><p className="eyebrow">{monthLabel(selectedMonth)} · {employee.name}</p><h2>Détail des événements</h2></div><span className="ledger-total">Total pondéré <strong>{formatHoursMinutes(monthlyRetained)}</strong></span></div>
          <div className="table-scroll"><table><thead><tr><th>Calendrier</th><th>Objet</th><th>Date</th><th>Début</th><th>Fin</th><th>Durée</th><th>Préparation</th><th>Rubrique</th></tr></thead><tbody>
            {events.map((event) => <tr key={event.id}><td><span className="calendar-cell"><i style={{ background: event.calendarColor ?? '#91b7bd' }} />{event.calendarName}</span></td><td><strong>{event.title}</strong></td><td>{eventDate(event.startsAt)}</td><td>{eventTime(event.startsAt)}</td><td>{eventTime(event.endsAt)}</td><td>{formatHoursMinutes(event.weightedHours)}</td><td><span className="coefficient">× {event.coefficient.toLocaleString('fr-FR')}</span></td><td>{categoryLabels[event.hourCategory]}</td></tr>)}
            {!eventsLoading && events.length === 0 && <tr><td colSpan={8} className="table-empty">Aucun événement configuré pour ce mois.</td></tr>}
            {eventsLoading && <tr><td colSpan={8} className="table-empty">Chargement du détail…</td></tr>}
          </tbody></table></div>
        </section>
      </>}

      {employee && view === 'annual' && annual && <>
        <section className="contract-strip" aria-label="Paramètres du contrat">
          <div><span>Contrat</span><strong>{employee.contractType}</strong></div>
          <label><span>Heures annuelles</span><input value={settingsDraft.annual} onChange={(event) => setSettingsDraft((state) => ({ ...state, annual: event.target.value }))} disabled={!canEdit} inputMode="decimal" aria-label="Heures annuelles du contrat" /></label>
          {employee.contractType === 'CDI' && <label><span>Référence temps plein</span><input value={settingsDraft.fullTime} onChange={(event) => setSettingsDraft((state) => ({ ...state, fullTime: event.target.value }))} disabled={!canEdit} inputMode="decimal" aria-label="Heures annuelles à temps plein" /></label>}
          {employee.contractType !== 'CDI' && <label><span>Mois de paie</span><input type="number" min="1" max="12" value={settingsDraft.paidMonths} onChange={(event) => setSettingsDraft((state) => ({ ...state, paidMonths: event.target.value }))} disabled={!canEdit} aria-label="Nombre de mois payés" /></label>}
        </section>

        <section className="annual-scoreboard" aria-label="Régularisation annuelle">
          <article><span>Reste à réaliser</span><strong>{formatHoursMinutes(annual.remainingToWorkHours)}</strong><small>sur le contrat annuel</small></article>
          <article><span>Total dû</span><strong>{formatHoursMinutes(annual.totalDueHours)}</strong><small>garantie + compléments</small></article>
          <article><span>Total bulletins</span><strong>{formatHoursMinutes(annual.payslipTotalHours)}</strong><small>heures + congés saisis</small></article>
          <article className={annual.payBalanceHours > 0 ? 'annual-scoreboard__balance--due' : 'annual-scoreboard__balance--settled'}><span>{annual.payBalanceHours > 0 ? 'Reste à payer' : annual.payBalanceHours < 0 ? 'Avance payée' : 'Solde'}</span><strong>{formatHoursMinutes(Math.abs(annual.payBalanceHours))}</strong><small>{annual.payBalanceHours === 0 ? 'saison équilibrée' : 'écart avec les bulletins'}</small></article>
        </section>

        <section className="panel annual-sheet">
          <div className="panel-heading"><div><p className="eyebrow">Saison {schoolYear}–{schoolYear + 1}</p><h2>Lecture annuelle, mois par mois</h2></div><span className="contract-badge">{employee.contractType} · {formatHoursMinutes(annualMinutes! / 60)} h</span></div>
          <div className="annual-table-scroll"><table><thead><tr><th>Désignation</th>{schoolMonths.map((month) => <th key={month}>{monthLabel(month)}</th>)}<th>Total</th></tr></thead><tbody>
            <AnnualRow label="Heures du contrat" months={months} value={(month) => month.contractHours} tone="work" />
            <AnnualRow label="Heures d’absences" months={months} value={(month) => month.absenceHours} tone="absence" />
            <AnnualRow label="Heures de remplacements" months={months} value={(month) => month.replacementHours} tone="replacement" />
            <AnnualRow label="Heures fériées" months={months} value={(month) => month.publicHolidayHours} />
            <AnnualRow label="Total du mois" months={months} value={(month) => month.contractHours - month.absenceHours + month.replacementHours + month.publicHolidayHours} strong />
            {employee.contractType === 'CDII' && <tr className="annual-row annual-row--weeks"><th scope="row">Semaines travaillées</th>{months.map((month) => <td key={month.month}>{month.workedWeeks || '—'}</td>)}<td><strong>{employee.annualWorkedWeeks}</strong></td></tr>}
            <tr className="annual-row annual-row--input"><th scope="row">Bulletin</th>{schoolMonths.map((month) => <td key={month}><input value={payrollDraft[month]?.paid ?? ''} onChange={(event) => setPayrollDraft((state) => ({ ...state, [month]: { ...state[month], paid: event.target.value } }))} disabled={!canEdit} aria-label={`Heures du bulletin de ${monthLabel(month)}`} /></td>)}<td><strong>{formatHoursMinutes(payslipHours)}</strong></td></tr>
            {employee.contractType === 'CDI' && <tr className="annual-row annual-row--input"><th scope="row">Congés payés au bulletin</th>{schoolMonths.map((month) => <td key={month}><input value={payrollDraft[month]?.leave ?? ''} onChange={(event) => setPayrollDraft((state) => ({ ...state, [month]: { ...state[month], leave: event.target.value } }))} disabled={!canEdit} aria-label={`Congés payés de ${monthLabel(month)}`} /></td>)}<td><strong>{formatHoursMinutes(payslipLeaveHours)}</strong></td></tr>}
          </tbody></table></div>
        </section>

        <section className="calculation-note">
          <ClipboardCheck aria-hidden="true" />
          <div><strong>Règle appliquée pour {employee.contractType}</strong>{employee.contractType === 'CDI'
            ? <p>Base garantie : maximum entre le contrat et les heures réalisées + absences. Congés : 10 % de cette base. Fériés : ratio exact {formatHoursMinutes(annualMinutes! / 60)} / {formatHoursMinutes(fullTimeMinutes! / 60)} × 7 h × {countWeekdayFrenchPublicHolidaysForSchoolSeason({ startYear: schoolYear })} jours ouvrés. Les remplacements s’ajoutent toujours.</p>
            : <p>Base garantie : maximum entre le contrat et les heures réalisées, absences et fériés du calendrier. Aucun congé supplémentaire. Les remplacements s’ajoutent toujours.</p>}
          </div>
        </section>
      </>}
    </div>
  )
}

function AnnualRow({ label, months, value, tone, strong = false }: {
  label: string
  months: MonthlyHours[]
  value: (month: MonthlyHours) => number
  tone?: 'work' | 'absence' | 'replacement'
  strong?: boolean
}) {
  const total = months.reduce((sum, month) => sum + value(month), 0)
  return <tr className={`annual-row${tone ? ` annual-row--${tone}` : ''}${strong ? ' annual-row--total' : ''}`}><th scope="row">{label}</th>{months.map((month) => <td key={month.month}>{formatHoursMinutes(value(month))}</td>)}<td><strong>{formatHoursMinutes(total)}</strong></td></tr>
}
