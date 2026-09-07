import { useEffect, useMemo, useRef, useState } from 'react'
import { BadgeCheck, CalendarDays, ChevronDown, CircleAlert, ClipboardCheck, RefreshCw, Save, Sigma } from 'lucide-react'
import { HoursChart } from '../components/HoursChart'
import {
  calculateAnnualSummary,
  calculateCdiPublicHolidayHours,
  CDI_FULL_TIME_ANNUAL_HOURS,
  formatHoursMinutes,
  getFrenchPublicHolidaysForSchoolSeason,
  isWeekday,
} from '../lib/annualSummary'
import { formatSyncDate, monthLabel, schoolMonths, schoolYearForDate } from '../lib/format'
import { contractTypeLabel } from '../lib/contracts'
import { calculateRetainedHours } from '../lib/hourTotals'
import { completedMonthsForSchoolYear, previousSchoolMonth } from '../lib/monthValidation'
import { getEmployeeSummaries, getMonthlyEventHours, getMonthlyTimeValidations, getValidationHistory, runIncrementalSync, saveAnnualTracking, validateTimeMonth } from '../services/api'
import { getGovernmentPublicHolidaysForSchoolSeason } from '../services/publicHolidays'
import type { EmployeeSummary, MonthlyEventHour, MonthlyHours, MonthlyPayrollEntry, MonthlyTimeValidation, SchoolYearSettings, SyncState, ValidationHistoryEvent } from '../types'
import { useAuth } from '../context/AuthContext'

const now = new Date()
const currentSchoolYear = schoolYearForDate(now)
const previousMonth = previousSchoolMonth(now)
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

const validationLabels = {
  not_due: 'Pas encore validable', to_validate: 'À valider', employee_validated: 'Validé par le salarié',
  changes_pending: 'Modification à approuver', admin_approved: 'Approuvé par l’administration',
}

const annualValidationLabels = {
  not_due: 'À venir', to_validate: 'À valider', employee_validated: 'Validé',
  changes_pending: 'À approuver', admin_approved: 'Approuvé',
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

function holidayDate(date: Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(date)
}

export function TimeTrackingPage() {
  const { user } = useAuth()
  const canEdit = user?.role === 'admin'
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [view, setView] = useState<'monthly' | 'annual'>('monthly')
  const [paidLeaveSource, setPaidLeaveSource] = useState<'theoretical' | 'payslip'>('theoretical')
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [events, setEvents] = useState<MonthlyEventHour[]>([])
  const [loading, setLoading] = useState(true)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [sync, setSync] = useState<SyncState>({ status: 'idle', lastSyncedAt: null })
  const [publicHolidays, setPublicHolidays] = useState(() => getFrenchPublicHolidaysForSchoolSeason({ startYear: currentSchoolYear }))
  const [holidaySource, setHolidaySource] = useState<'loading' | 'government' | 'fallback'>('loading')
  const [settingsDraft, setSettingsDraft] = useState({ annual: '', fullTime: '', paidMonths: '12' })
  const [payrollDraft, setPayrollDraft] = useState<Record<number, { paid: string; leave: string }>>({})
  const [validations, setValidations] = useState<MonthlyTimeValidation[]>([])
  const [validationMessage, setValidationMessage] = useState('')
  const [validating, setValidating] = useState(false)
  const [validationHistory, setValidationHistory] = useState<ValidationHistoryEvent[]>([])
  const automaticSyncStarted = useRef(false)

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

  useEffect(() => {
    void getMonthlyTimeValidations().then(setValidations).catch(() => setValidations([]))
  }, [])

  useEffect(() => {
    if (user?.role !== 'employee' || automaticSyncStarted.current) return
    automaticSyncStarted.current = true
    setSync({ status: 'syncing', lastSyncedAt: null })
    void runIncrementalSync('automatic').then(async (result) => {
      setSync(result)
      const [items, updatedValidations] = await Promise.all([
        getEmployeeSummaries(schoolYear), getMonthlyTimeValidations(),
      ])
      setEmployees(items); setValidations(updatedValidations)
    }).catch(() => setSync({ status: 'error', lastSyncedAt: null, message: 'La synchronisation automatique n’a pas pu aboutir. Les dernières données disponibles restent affichées.' }))
  }, [user, schoolYear])

  useEffect(() => {
    let active = true
    setPublicHolidays(getFrenchPublicHolidaysForSchoolSeason({ startYear: schoolYear }))
    setHolidaySource('loading')
    void getGovernmentPublicHolidaysForSchoolSeason({ startYear: schoolYear })
      .then((holidays) => {
        if (!active) return
        setPublicHolidays(holidays)
        setHolidaySource('government')
      })
      .catch(() => {
        if (active) setHolidaySource('fallback')
      })
    return () => { active = false }
  }, [schoolYear])

  const employee = employees.find((item) => item.id === selectedEmployeeId)
  const isIndependent = employee?.contractType === 'INDEP'
  const employeeValidations = validations.filter((item) => item.employeeId === employee?.id)
  const validationFor = (targetSchoolYear: number, month: number) => employeeValidations.find(
    (item) => item.schoolYear === targetSchoolYear && item.month === month,
  )
  const completedMonths = completedMonthsForSchoolYear(schoolYear, now)
  const missingValidationMonths = employee?.contractType === 'CDI'
    ? completedMonths.filter((month) => !validationFor(schoolYear, month))
    : []
  const pendingChangeMonths = employee?.contractType === 'CDI'
    ? employeeValidations.filter((item) => item.schoolYear === schoolYear && item.status === 'changes_pending')
    : []
  const firstPendingChange = employeeValidations.find((item) => item.status === 'changes_pending')
  const selectedValidation = employee ? validationFor(schoolYear, selectedMonth) : undefined
  const calendarMonths = useMemo(() => schoolMonths.map((month) => employee?.monthlyHours.find((item) => item.month === month) ?? emptyMonth(month)), [employee])

  useEffect(() => {
    if (!employee) { setValidationHistory([]); return }
    void getValidationHistory(employee.id, schoolYear).then(setValidationHistory).catch(() => setValidationHistory([]))
  }, [employee, schoolYear])

  useEffect(() => {
    if (!employee) return
    setSettingsDraft({
      annual: formatHoursMinutes(employee.settings.annualContractMinutes / 60),
      fullTime: formatHoursMinutes(CDI_FULL_TIME_ANNUAL_HOURS),
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

  const calendarTotals = useMemo(() => calendarMonths.reduce((sum, month) => ({
    contract: sum.contract + month.contractHours,
    absence: sum.absence + month.absenceHours,
    replacement: sum.replacement + month.replacementHours,
    holiday: sum.holiday + month.publicHolidayHours,
  }), { contract: 0, absence: 0, replacement: 0, holiday: 0 }), [calendarMonths])

  const payrollEntries = useMemo<MonthlyPayrollEntry[]>(() => schoolMonths.map((month) => ({
    month,
    paidMinutes: parseDuration(payrollDraft[month]?.paid ?? '') ?? 0,
    paidLeaveMinutes: isIndependent ? 0 : parseDuration(payrollDraft[month]?.leave ?? '') ?? 0,
  })), [payrollDraft, isIndependent])
  const payslipHours = payrollEntries.reduce((sum, entry) => sum + entry.paidMinutes, 0) / 60
  const payslipLeaveHours = payrollEntries.reduce((sum, entry) => sum + entry.paidLeaveMinutes, 0) / 60
  const annualMinutes = isIndependent ? 0 : parseDuration(settingsDraft.annual)
  const fullTimeMinutes = CDI_FULL_TIME_ANNUAL_HOURS * 60
  const paidMonths = Number(settingsDraft.paidMonths)
  const validContractDraft = annualMinutes != null && (isIndependent || annualMinutes > 0) && fullTimeMinutes != null && fullTimeMinutes > 0
  const validDraft = validContractDraft
    && Number.isInteger(paidMonths) && paidMonths >= 1 && paidMonths <= 12
    && schoolMonths.every((month) => parseDuration(payrollDraft[month]?.paid ?? '') != null && parseDuration(payrollDraft[month]?.leave ?? '') != null)

  const weekdayHolidayCount = publicHolidays.filter(({ date }) => isWeekday(date)).length
  const cdiHolidayCalculation = employee?.contractType === 'CDI' && validContractDraft
    ? calculateCdiPublicHolidayHours({
      annualContractHours: annualMinutes! / 60,
      fullTimeAnnualHours: fullTimeMinutes! / 60,
      realizedHoursExcludingHolidays: calendarTotals.contract + calendarTotals.replacement - calendarTotals.absence,
      weekdayHolidayCount,
    })
    : null

  const months = useMemo(() => calendarMonths.map((month) => {
    if (!cdiHolidayCalculation) return month
    const automaticHolidayHours = publicHolidays
      .filter(({ date }) => date.getUTCMonth() + 1 === month.month && isWeekday(date))
      .length * cdiHolidayCalculation.hoursPerHoliday
    return {
      ...month,
      publicHolidayHours: automaticHolidayHours,
      weightedHours: month.weightedHours - month.publicHolidayHours + automaticHolidayHours,
    }
  }), [calendarMonths, cdiHolidayCalculation, publicHolidays])

  const totals = useMemo(() => months.reduce((sum, month) => ({
    contract: sum.contract + month.contractHours,
    absence: sum.absence + month.absenceHours,
    replacement: sum.replacement + month.replacementHours,
    holiday: sum.holiday + month.publicHolidayHours,
  }), { contract: 0, absence: 0, replacement: 0, holiday: 0 }), [months])

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
  const selectedPaidLeaveHours = paidLeaveSource === 'theoretical'
    ? (annual?.paidLeaveDueHours ?? 0)
    : payslipLeaveHours
  const selectedTotalDueHours = annual && employee?.contractType === 'CDI'
    ? annual.guaranteedBaseHours + selectedPaidLeaveHours
    : (annual?.totalDueHours ?? 0)
  const selectedPayBalanceHours = annual ? selectedTotalDueHours - annual.payslipTotalHours : 0

  const monthlyRealizedHours = (month: MonthlyHours) => employee?.contractType === 'CDI'
    ? calculateRetainedHours(month)
    : employee?.contractType === 'INDEP'
      ? month.contractHours
      : month.contractHours + month.absenceHours + month.publicHolidayHours

  const synchronize = async () => {
    setSync({ status: 'syncing', lastSyncedAt: null })
    try {
      const result = await runIncrementalSync('manual')
      setSync(result)
      try {
        const items = await getEmployeeSummaries(schoolYear)
        setEmployees(items)
        setSelectedEmployeeId((current) => items.some((item) => item.id === current) ? current : (items[0]?.id ?? ''))
      } catch {
        setSync({ ...result, status: 'error', message: 'Google a été synchronisé, mais les données du suivi n’ont pas pu être rechargées. Rechargez la page.' })
      }
    } catch {
      setSync({ status: 'error', lastSyncedAt: null, message: 'La synchronisation a échoué. Vérifiez la connexion Google.' })
    }
  }

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

  const validateSelectedMonth = async () => {
    if (!employee) return
    setValidating(true)
    setValidationMessage('')
    try {
      const validation = await validateTimeMonth(employee.id, schoolYear, selectedMonth)
      setValidations((items) => [...items.filter((item) => !(
        item.employeeId === validation.employeeId && item.schoolYear === validation.schoolYear && item.month === validation.month
      )), validation])
      const history = await getValidationHistory(employee.id, schoolYear).catch(() => validationHistory)
      setValidationHistory(history)
      setValidationMessage(`${monthLabel(selectedMonth)} a été validé. Toute modification ultérieure devra être approuvée par l’administration.`)
    } catch {
      setValidationMessage('La validation du mois a échoué. Rechargez la page puis réessayez.')
    } finally {
      setValidating(false)
    }
  }

  const openPreviousMonthTask = () => {
    setSchoolYear(previousMonth.schoolYear)
    setSelectedMonth(previousMonth.month)
    setView('monthly')
  }

  const openPendingChange = () => {
    if (!firstPendingChange) return
    setSchoolYear(firstPendingChange.schoolYear)
    setSelectedMonth(firstPendingChange.month)
    setView('monthly')
  }

  const monthData = months.find((item) => item.month === selectedMonth) ?? emptyMonth(selectedMonth)
  const monthlyRetained = calculateRetainedHours(monthData)
  const visibleEvents = employee?.contractType === 'CDI'
    ? events.filter((event) => event.hourCategory !== 'public_holiday')
    : events
  const selectedMonthHolidays = employee?.contractType === 'CDI'
    ? publicHolidays.filter(({ date }) => date.getUTCMonth() + 1 === selectedMonth)
    : []
  const validationToneFor = (month: number) => {
    if (!completedMonths.includes(month)) return 'not_due'
    const validation = validationFor(schoolYear, month)
    if (!validation) return 'to_validate'
    if (validation.status === 'changes_pending') return 'changes_pending'
    return validation.approvedAt ? 'admin_approved' : 'employee_validated'
  }
  const canManualSync = canEdit || (user?.role === 'employee' && employee?.contractType === 'CDI')
  const visibleHistory = validationHistory.filter((event) => event.employeeId === employee?.id)

  return (
    <div className="page tracking-page">
      <header className="page-heading">
        <div><p className="eyebrow">Suivi des salariés</p><h1>Du calendrier au bulletin</h1><p>Contrôlez chaque mois, puis régularisez la saison de septembre à août sans perdre le détail des heures.</p></div>
        {canManualSync && <div className="page-heading__actions">
          <button className="button button--secondary" onClick={() => void synchronize()} disabled={sync.status === 'syncing'}><RefreshCw className={sync.status === 'syncing' ? 'spin' : ''} aria-hidden="true" />{sync.status === 'syncing' ? 'Synchronisation…' : 'Actualiser Google'}</button>
          {view === 'annual' && <button className="button button--primary" onClick={() => void save()} disabled={saving || !employee}><Save aria-hidden="true" />{saving ? 'Enregistrement…' : 'Enregistrer la saison'}</button>}
        </div>}
      </header>

      {sync.message && <div className={`alert ${sync.status === 'error' ? 'alert--error' : 'alert--success'}`} role="status">{sync.message}{sync.lastSyncedAt ? ` · ${formatSyncDate(sync.lastSyncedAt)}` : ''}</div>}
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {saveMessage && <div className={`alert ${saveMessage.includes('enregistré') ? 'alert--success' : 'alert--warning'}`} role="status">{saveMessage}</div>}
      {validationMessage && <div className={`alert ${validationMessage.includes('a été validé') ? 'alert--success' : 'alert--warning'}`} role="status">{validationMessage}</div>}
      {user?.role === 'employee' && firstPendingChange && <div className="alert alert--urgent validation-warning" role="alert">
        <CircleAlert aria-hidden="true" />
        <span><strong>Des heures ont changé après votre validation.</strong> L’administration doit approuver le mois de {monthLabel(firstPendingChange.month)}.</span>
        <button className="button button--secondary" type="button" onClick={openPendingChange}>Voir la modification</button>
      </div>}
      {user?.role === 'employee' && employee?.contractType === 'CDI' && !validationFor(previousMonth.schoolYear, previousMonth.month) && <div className="alert alert--warning validation-warning" role="alert">
        <CircleAlert aria-hidden="true" />
        <span><strong>Validation mensuelle à faire.</strong> Contrôlez puis validez les heures de {monthLabel(previousMonth.month)}.</span>
        <button className="button button--secondary" type="button" onClick={openPreviousMonthTask}>Voir le mois</button>
      </div>}
      {employee?.contractType === 'CDI' && holidaySource === 'fallback' && <div className="alert alert--warning" role="status">L’API gouvernementale des jours fériés est temporairement indisponible. Le calendrier métropolitain de secours est affiché.</div>}

      <section className="filters tracking-filters" aria-label="Filtres du suivi">
        {user?.role === 'admin' && <label><span>Salarié</span><div className="select-wrap"><select value={selectedEmployeeId} onChange={(event) => { setSelectedEmployeeId(event.target.value); setSaveMessage('') }} disabled={loading}><option value="">Sélectionner</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name} · {contractTypeLabel(item.contractType)}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>}
        <label><span>Saison</span><div className="select-wrap"><select value={schoolYear} onChange={(event) => setSchoolYear(Number(event.target.value))}>{[currentSchoolYear - 2, currentSchoolYear - 1, currentSchoolYear, currentSchoolYear + 1].map((year) => <option key={year} value={year}>{year}–{year + 1}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>
        {view === 'monthly' && <label><span>Mois</span><div className="select-wrap"><select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>{schoolMonths.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>}
      </section>

      <div className="view-tabs" role="tablist" aria-label="Type de suivi">
        <button role="tab" aria-selected={view === 'monthly'} onClick={() => setView('monthly')}><CalendarDays aria-hidden="true" />Détail mensuel</button>
        <button role="tab" aria-selected={view === 'annual'} onClick={() => setView('annual')}><Sigma aria-hidden="true" />Synthèse annuelle</button>
      </div>

      {!loading && !employee && <section className="panel tracking-empty"><ClipboardCheck aria-hidden="true" /><h2>Aucun salarié configuré</h2><p>Activez une ressource et renseignez son contrat dans Configuration.</p></section>}

      {employee && view === 'monthly' && <>
        {employee.contractType === 'CDI' && <div className="validation-legend" aria-label="Légende des validations">{Object.entries(validationLabels).map(([tone, label]) => <span key={tone}><i className={`validation-tone validation-tone--${tone}`} />{label}</span>)}</div>}
        {employee.contractType === 'CDI' && completedMonths.includes(selectedMonth) && <section className={`panel month-validation-card month-validation-card--${validationToneFor(selectedMonth)}`} aria-label="Validation du mois">
          <div>
            <p className="eyebrow">Contrôle mensuel</p>
            <h2>{selectedValidation?.status === 'changes_pending' ? 'Modification à faire approuver' : selectedValidation?.approvedAt ? 'Mois approuvé par l’administration' : selectedValidation ? 'Mois validé par le salarié' : 'Validation à faire'}</h2>
            <p>{selectedValidation?.status === 'changes_pending'
              ? 'Les données Google ont changé depuis votre validation. L’administration doit approuver le nouvel état.'
              : selectedValidation
                ? `Validé le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(selectedValidation.validatedAt))}. Toute modification ultérieure sera signalée.`
                : 'Vérifiez le détail ci-dessous avant d’attester que ce mois est complet.'}</p>
          </div>
          {user?.role === 'employee' && !selectedValidation && <button className="button button--primary" type="button" onClick={() => void validateSelectedMonth()} disabled={validating}>
            <BadgeCheck aria-hidden="true" />{validating ? 'Validation…' : `Valider ${monthLabel(selectedMonth)}`}
          </button>}
        </section>}
        <section className="metric-grid tracking-metrics" aria-label="Totaux du mois">
          <article className="metric metric--lead"><p>Heures retenues</p><strong>{formatHoursMinutes(monthlyRetained)} <small>h</small></strong><span>{monthData.eventCount} événement{monthData.eventCount > 1 ? 's' : ''} calendrier · {selectedMonthHolidays.length} férié{selectedMonthHolidays.length > 1 ? 's' : ''}</span></article>
          <article className="metric"><p>{isIndependent ? 'Heures réalisées' : 'Contrat'}</p><strong>{formatHoursMinutes(monthData.contractHours)} <small>h</small></strong><span>{isIndependent ? 'Temps réel, tous calendriers' : 'Avec et sans préparation'}</span></article>
          {!isIndependent && <><article className="metric"><p>Absences</p><strong>{formatHoursMinutes(monthData.absenceHours)} <small>h</small></strong><span>Total des heures d’absence</span></article>
          <article className="metric"><p>Remplacements</p><strong>{formatHoursMinutes(monthData.replacementHours)} <small>h</small></strong><span>À payer en plus du contrat</span></article>
          <article className="metric"><p>Fériés</p><strong>{formatHoursMinutes(monthData.publicHolidayHours)} <small>h</small></strong><span>Total des heures fériées</span></article></>}
        </section>
        <section className={`panel monthly-ledger${isIndependent ? ' monthly-ledger--independent' : ''}`}>
          <div className="panel-heading"><div><p className="eyebrow">{monthLabel(selectedMonth)} · {employee.name}</p><h2>Détail des événements</h2></div><span className="ledger-total">{isIndependent ? 'Total réel' : 'Total pondéré'} <strong>{formatHoursMinutes(monthData.weightedHours)}</strong></span></div>
          <div className="table-scroll"><table><colgroup>{isIndependent
            ? <><col className="monthly-column--calendar" /><col className="monthly-column--title" /><col className="monthly-column--date" /><col className="monthly-column--time" span={2} /><col className="monthly-column--duration" /><col className="monthly-column--status" /></>
            : <><col className="monthly-column--calendar" /><col className="monthly-column--title" /><col className="monthly-column--date" /><col className="monthly-column--time" span={2} /><col className="monthly-column--duration" /><col className="monthly-column--coefficient" /><col className="monthly-column--category" /><col className="monthly-column--status" /></>
          }</colgroup><thead><tr><th>Calendrier</th><th>Objet</th><th>Date</th><th>Début</th><th>Fin</th><th>Durée</th>{!isIndependent && <><th>Coefficient</th><th>Rubrique</th></>}<th>Prise en compte</th></tr></thead><tbody>
            {visibleEvents.map((event) => <tr key={event.id}><td data-label="Calendrier"><span className="calendar-cell"><i style={{ background: event.calendarColor ?? '#91b7bd' }} />{event.calendarName}</span></td><td data-label="Objet"><strong>{event.title}</strong></td><td data-label="Date">{eventDate(event.startsAt)}</td><td data-label="Début">{eventTime(event.startsAt)}</td><td data-label="Fin">{eventTime(event.endsAt)}</td><td data-label="Durée">{formatHoursMinutes(event.weightedHours)}</td>{!isIndependent && <><td data-label="Coefficient"><span className="coefficient">× {event.coefficient.toLocaleString('fr-FR')}</span></td><td data-label="Rubrique">{categoryLabels[event.hourCategory]}</td></>}<td data-label="Prise en compte"><span className="holiday-status">Calendrier</span></td></tr>)}
            {selectedMonthHolidays.map((holiday) => {
              const counted = isWeekday(holiday.date)
              return <tr className="holiday-row" key={`holiday-${holiday.date.toISOString()}`}><td data-label="Calendrier"><span className="calendar-cell"><i />API du gouvernement</span></td><td data-label="Objet"><strong>{holiday.name}</strong></td><td data-label="Date">{holidayDate(holiday.date)}</td><td data-label="Début">—</td><td data-label="Fin">—</td><td data-label="Durée">{formatHoursMinutes(counted ? (cdiHolidayCalculation?.hoursPerHoliday ?? 0) : 0)}</td><td data-label="Coefficient"><span className="coefficient">× {(cdiHolidayCalculation?.coefficient ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 4 })}</span></td><td data-label="Rubrique">Jour férié</td><td data-label="Prise en compte"><span className={`holiday-status holiday-status--${counted ? 'counted' : 'excluded'}`}>{counted ? 'Compté · lundi à vendredi' : 'Non compté · week-end'}</span></td></tr>
            })}
            {!eventsLoading && visibleEvents.length === 0 && selectedMonthHolidays.length === 0 && <tr><td colSpan={isIndependent ? 7 : 9} className="table-empty">Aucun événement configuré pour ce mois.</td></tr>}
            {eventsLoading && <tr><td colSpan={isIndependent ? 7 : 9} className="table-empty">Chargement du détail…</td></tr>}
          </tbody></table></div>
        </section>
      </>}

      {employee && view === 'annual' && annual && <>
        {employee.contractType === 'CDI' && (missingValidationMonths.length > 0 || pendingChangeMonths.length > 0) && <div className="alert alert--warning validation-warning" role="alert">
          <CircleAlert aria-hidden="true" />
          <span><strong>Validations mensuelles à traiter.</strong> {missingValidationMonths.length > 0 ? `${missingValidationMonths.length} mois terminé${missingValidationMonths.length > 1 ? 's' : ''} non validé${missingValidationMonths.length > 1 ? 's' : ''}` : ''}{missingValidationMonths.length > 0 && pendingChangeMonths.length > 0 ? ' et ' : ''}{pendingChangeMonths.length > 0 ? `${pendingChangeMonths.length} modification${pendingChangeMonths.length > 1 ? 's' : ''} en attente d’approbation` : ''}.</span>
        </div>}
        <section className="contract-strip" aria-label="Paramètres du contrat">
          <div><span>Contrat</span><strong>{contractTypeLabel(employee.contractType)}</strong></div>
          {!isIndependent && <label><span>Heures annuelles</span><input value={settingsDraft.annual} onChange={(event) => setSettingsDraft((state) => ({ ...state, annual: event.target.value }))} disabled={!canEdit} inputMode="decimal" aria-label="Heures annuelles du contrat" /></label>}
          {employee.contractType === 'CDI' && <label><span>Référence temps plein</span><input value={settingsDraft.fullTime} disabled aria-label="Heures annuelles à temps plein" /></label>}
          {!isIndependent && employee.contractType !== 'CDI' && <label><span>Mois de paie</span><input type="number" min="1" max="12" value={settingsDraft.paidMonths} onChange={(event) => setSettingsDraft((state) => ({ ...state, paidMonths: event.target.value }))} disabled={!canEdit} aria-label="Nombre de mois payés" /></label>}
        </section>

        {!isIndependent && <section className="annual-breakdown-card" aria-label="Calcul annuel des heures">
          <header className="annual-breakdown-card__heading">
            <div><p className="eyebrow">Décomposition annuelle</p><h2>Des rubriques au reste à réaliser</h2></div>
            <span className="contract-badge">Coefficients inclus</span>
          </header>
          <dl className="annual-breakdown-card__values">
            <div><dt>Heures contrat</dt><dd>{formatHoursMinutes(totals.contract)}</dd></div>
            <div><dt>Absences</dt><dd>{formatHoursMinutes(totals.absence)}</dd></div>
            <div><dt>Remplacements</dt><dd>{formatHoursMinutes(totals.replacement)}</dd></div>
            <div><dt>Fériés</dt><dd>{formatHoursMinutes(totals.holiday)}</dd></div>
          </dl>
          <div className="annual-breakdown-card__calculations">
            <div><span>Calcul des heures réalisées</span><strong>{employee.contractType === 'CDI'
              ? `${formatHoursMinutes(totals.contract)} contrat + ${formatHoursMinutes(totals.holiday)} fériés + ${formatHoursMinutes(totals.replacement)} remplacements − ${formatHoursMinutes(totals.absence)} absences = ${formatHoursMinutes(annual.contractualRealizedHours)}`
              : `${formatHoursMinutes(totals.contract)} contrat + ${formatHoursMinutes(totals.absence)} absences + ${formatHoursMinutes(totals.holiday)} fériés = ${formatHoursMinutes(annual.contractualRealizedHours)}`}</strong>
              {employee.contractType !== 'CDI' && <small>Les {formatHoursMinutes(totals.replacement)} de remplacements sont payées en plus et n’entrent pas dans le calcul du reste. Total dû = max({formatHoursMinutes(annualMinutes! / 60)} contrat, {formatHoursMinutes(annual.contractualRealizedHours)} réalisées) + {formatHoursMinutes(totals.replacement)} remplacements = {formatHoursMinutes(annual.totalDueHours)}.</small>}
            </div>
            <i aria-hidden="true">→</i>
            <div className="annual-breakdown-card__result">
              <span>{annual.remainingToWorkHours > 0 ? 'Calcul du reste à réaliser' : annual.overtimeHours > 0 ? 'Calcul des heures en plus du contrat' : 'Contrat annuel atteint'}</span>
              <strong>{annual.remainingToWorkHours > 0
                ? `${formatHoursMinutes(annualMinutes! / 60)} contrat − ${formatHoursMinutes(annual.contractualRealizedHours)} réalisées = ${formatHoursMinutes(annual.remainingToWorkHours)} à réaliser`
                : annual.overtimeHours > 0
                  ? `${formatHoursMinutes(annual.contractualRealizedHours)} réalisées − ${formatHoursMinutes(annualMinutes! / 60)} contrat = +${formatHoursMinutes(annual.overtimeHours)} en plus du contrat`
                  : `${formatHoursMinutes(annual.contractualRealizedHours)} réalisées = ${formatHoursMinutes(annualMinutes! / 60)} contrat · 0:00 à réaliser`}</strong>
            </div>
          </div>
          <p className="annual-breakdown-card__note">Les heures issues des calendriers sont déjà pondérées par les coefficients configurés (×1 ou ×1,25).{employee.contractType === 'CDI' ? ' Les fériés sont calculés séparément avec le coefficient annuel détaillé plus bas.' : ''} Valeurs affichées arrondies à la minute.</p>
        </section>}

        {employee.contractType === 'CDI' && <section className="paid-leave-choice" aria-labelledby="paid-leave-choice-title">
          <header>
            <div><p className="eyebrow">Congés payés</p><h2 id="paid-leave-choice-title">Quel montant compter dans la synthèse ?</h2></div>
            <span className="paid-leave-choice__selection">Source retenue : {paidLeaveSource === 'theoretical' ? 'théorique' : 'bulletins'}</span>
          </header>
          <div className="paid-leave-switch" role="radiogroup" aria-label="Source des congés payés comptabilisés">
            <label>
              <input type="radio" name="paid-leave-source" value="theoretical" checked={paidLeaveSource === 'theoretical'} onChange={() => setPaidLeaveSource('theoretical')} />
              <span><small>Congés théoriques</small><strong>{formatHoursMinutes(annual.paidLeaveDueHours)}</strong><em>10 % de la base garantie</em></span>
            </label>
            <label>
              <input type="radio" name="paid-leave-source" value="payslip" checked={paidLeaveSource === 'payslip'} onChange={() => setPaidLeaveSource('payslip')} />
              <span><small>Congés des bulletins</small><strong>{formatHoursMinutes(payslipLeaveHours)}</strong><em>Somme des congés saisis mois par mois</em></span>
            </label>
          </div>
          <p className="paid-leave-choice__formula"><strong>Calcul du théorique :</strong> 10 % × max({formatHoursMinutes(annualMinutes! / 60)} de contrat, {formatHoursMinutes(annual.contractualRealizedHours)} réalisées) = {formatHoursMinutes(annual.paidLeaveDueHours)}.</p>
        </section>}

        <section className="annual-scoreboard" aria-label="Régularisation annuelle">
          {!isIndependent && <article className={annual.remainingToWorkHours > 0 ? 'annual-scoreboard__progress--due' : 'annual-scoreboard__progress--complete'}><span>Reste à réaliser</span><strong>{formatHoursMinutes(annual.remainingToWorkHours)}</strong><small>{annual.overtimeHours > 0 ? `${formatHoursMinutes(annual.overtimeHours)} en plus du contrat` : annual.remainingToWorkHours === 0 ? 'contrat atteint exactement' : `${formatHoursMinutes(annual.contractualRealizedHours)} réalisées sur ${formatHoursMinutes(annualMinutes! / 60)}`}</small></article>}
          <article><span>Total dû</span><strong>{formatHoursMinutes(selectedTotalDueHours)}</strong><small>{employee.contractType === 'CDI' ? `base garantie + congés ${paidLeaveSource === 'theoretical' ? 'théoriques' : 'des bulletins'}` : isIndependent ? 'durée réelle des événements' : 'garantie + compléments'}</small></article>
          <article><span>Total bulletins</span><strong>{formatHoursMinutes(annual.payslipTotalHours)}</strong><small>{isIndependent ? 'heures saisies' : 'heures + congés saisis'}</small></article>
          <article className={selectedPayBalanceHours > 0 ? 'annual-scoreboard__balance--due' : 'annual-scoreboard__balance--settled'}><span>{selectedPayBalanceHours > 0 ? 'Reste à payer' : selectedPayBalanceHours < 0 ? 'Avance payée' : 'Solde'}</span><strong>{formatHoursMinutes(Math.abs(selectedPayBalanceHours))}</strong><small>{selectedPayBalanceHours === 0 ? 'saison équilibrée' : employee.contractType === 'CDI' ? `total dû avec congés ${paidLeaveSource === 'theoretical' ? 'théoriques' : 'des bulletins'} − bulletins` : 'écart avec les bulletins'}</small></article>
        </section>

        <section className="panel chart-panel annual-chart">
          <div className="panel-heading"><div><p className="eyebrow">Progression de la saison {schoolYear}–{schoolYear + 1}</p><h2>Heures pondérées</h2></div><span className="legend"><i /> Total après coefficient</span></div>
          <HoursChart data={months} activeMonth="all" />
        </section>

        <section className="panel annual-sheet">
          <div className="panel-heading"><div><p className="eyebrow">Saison {schoolYear}–{schoolYear + 1}</p><h2>Lecture annuelle, mois par mois</h2></div><span className="contract-badge">{contractTypeLabel(employee.contractType)} · {isIndependent ? 'Temps réel' : `${formatHoursMinutes(annualMinutes! / 60)} h`}</span></div>
          {employee.contractType === 'CDI' && <div className="validation-legend" aria-label="Légende des validations">{Object.entries(validationLabels).map(([tone, label]) => <span key={tone}><i className={`validation-tone validation-tone--${tone}`} />{label}</span>)}</div>}
          <div className="annual-table-scroll"><table><thead><tr><th>Désignation</th>{schoolMonths.map((month) => <th key={month}>{monthLabel(month)}</th>)}<th>Total</th></tr></thead><tbody>
            {employee.contractType === 'CDI' && <tr className="annual-validation-row"><th scope="row">Statut de validation</th>{schoolMonths.map((month) => { const tone = validationToneFor(month); const label = validationLabels[tone]; return <td className={`validation-cell validation-cell--${tone}`} data-label={monthLabel(month)} aria-label={`${monthLabel(month)} : ${label}`} title={label} key={month}>{annualValidationLabels[tone]}</td> })}<td data-label="Total">—</td></tr>}
            <AnnualRow label={isIndependent ? 'Heures réalisées' : 'Heures du contrat'} months={months} value={(month) => month.contractHours} tone="work" />
            {!isIndependent && <><AnnualRow label="Heures d’absences" months={months} value={(month) => month.absenceHours} tone="absence" />
            <AnnualRow label="Heures de remplacements" months={months} value={(month) => month.replacementHours} tone="replacement" />
            <AnnualRow label="Heures fériées" months={months} value={(month) => month.publicHolidayHours} /></>}
            {!isIndependent && <AnnualRow label="Heures réalisées" months={months} value={monthlyRealizedHours} strong />}
            {employee.contractType === 'CDII' && <tr className="annual-row annual-row--weeks"><th scope="row">Semaines travaillées</th>{months.map((month) => <td key={month.month} data-label={monthLabel(month.month)}>{month.workedWeeks || '—'}</td>)}<td data-label="Total"><strong>{employee.annualWorkedWeeks}</strong></td></tr>}
            <tr className="annual-row annual-row--input"><th scope="row">Bulletin</th>{schoolMonths.map((month) => <td key={month} data-label={monthLabel(month)}><input value={payrollDraft[month]?.paid ?? ''} onChange={(event) => setPayrollDraft((state) => ({ ...state, [month]: { ...state[month], paid: event.target.value } }))} disabled={!canEdit} aria-label={`Heures du bulletin de ${monthLabel(month)}`} /></td>)}<td data-label="Total"><strong>{formatHoursMinutes(payslipHours)}</strong></td></tr>
            {employee.contractType === 'CDI' && <tr className="annual-row annual-row--input"><th scope="row">Congés payés au bulletin</th>{schoolMonths.map((month) => <td key={month} data-label={monthLabel(month)}><input value={payrollDraft[month]?.leave ?? ''} onChange={(event) => setPayrollDraft((state) => ({ ...state, [month]: { ...state[month], leave: event.target.value } }))} disabled={!canEdit} aria-label={`Congés payés de ${monthLabel(month)}`} /></td>)}<td data-label="Total"><strong>{formatHoursMinutes(payslipLeaveHours)}</strong></td></tr>}
          </tbody></table></div>
        </section>
        {employee.contractType === 'CDI' && <section className="panel validation-history" aria-label="Historique des validations">
          <div className="panel-heading"><div><p className="eyebrow">Traçabilité</p><h2>Historique des validations</h2></div></div>
          {!visibleHistory.length ? <p>Aucune validation enregistrée pour ce salarié.</p> : <ol>{visibleHistory.map((event) => <li key={event.id}><strong>{event.eventType === 'employee_validated' ? 'Validé par le salarié' : event.eventType === 'source_changed' ? 'Modification Google détectée' : 'Approuvé par l’administration'}</strong><span>{monthLabel(event.month)} {event.month >= 9 ? event.schoolYear : event.schoolYear + 1}</span><time dateTime={event.occurredAt}>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.occurredAt))}</time></li>)}</ol>}
        </section>}

        {employee.contractType === 'CDI' && <section className="panel annual-holidays" aria-label="Jours fériés de la saison">
          <div className="panel-heading"><div><p className="eyebrow">Source · API du gouvernement</p><h2>Jours fériés de la saison</h2></div><span className="contract-badge">{weekdayHolidayCount} comptés sur {publicHolidays.length}</span></div>
          <div className="holiday-calendar">{schoolMonths.map((month) => {
            const monthHolidays = publicHolidays.filter(({ date }) => date.getUTCMonth() + 1 === month)
            return <article key={month}><h3>{monthLabel(month)}</h3>{monthHolidays.length === 0
              ? <p className="holiday-calendar__empty">Aucun jour férié</p>
              : monthHolidays.map((holiday) => {
                const counted = isWeekday(holiday.date)
                return <div className="holiday-calendar__day" key={holiday.date.toISOString()}><span><strong>{holiday.name}</strong><small>{holidayDate(holiday.date)}</small></span><span className={`holiday-status holiday-status--${counted ? 'counted' : 'excluded'}`}>{counted ? `${formatHoursMinutes(cdiHolidayCalculation?.hoursPerHoliday ?? 0)} · compté` : '0:00 · non compté'}</span></div>
              })}</article>
          })}</div>
        </section>}

        {(employee.contractType === 'CDI' || isIndependent) && <section className="calculation-note">
          <ClipboardCheck aria-hidden="true" />
          <div><strong>Règle appliquée pour {contractTypeLabel(employee.contractType)}</strong>{employee.contractType === 'CDI'
            ? <>
              <div className="calculation-breakdown" role="region" aria-label="Comparaison entre les heures réelles et le contrat annuel">
                <span><small>Heures réelles</small><b>{formatHoursMinutes(cdiHolidayCalculation?.realizedHours ?? 0)}</b></span>
                <i>{cdiHolidayCalculation?.basis === 'realized' ? '≥' : '<'}</i>
                <span><small>Contrat annuel</small><b>{formatHoursMinutes(annualMinutes! / 60)}</b></span>
                <i>→</i>
                <span className="calculation-breakdown__result"><small>Coefficient retenu</small><b>{cdiHolidayCalculation?.basis === 'realized' ? 'heures réelles' : 'contrat annuel'} / 1582 = {cdiHolidayCalculation?.coefficient.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}</b></span>
              </div>
              <p>{cdiHolidayCalculation?.basis === 'realized'
                ? `les heures réelles atteignent ou dépassent le contrat : le coefficient évolue donc avec le réel (${formatHoursMinutes(cdiHolidayCalculation?.realizedHours ?? 0)} / 1582).`
                : `les heures réelles restent sous le contrat : le coefficient est donc garanti sur le contrat annuel (${formatHoursMinutes(annualMinutes! / 60)} / 1582).`} Chaque férié du lundi au vendredi vaut 7 h × ce coefficient. Les congés représentent 10 % de la base garantie.</p>
            </>
            : <p>Heures réalisées = somme des durées réelles des événements = {formatHoursMinutes(annual.contractualRealizedHours)}. Aucune majoration de préparation, garantie annuelle ou heure de congé ou de férié automatique n’est ajoutée.</p>}
          </div>
        </section>}
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
  return <tr className={`annual-row${tone ? ` annual-row--${tone}` : ''}${strong ? ' annual-row--total' : ''}`}><th scope="row">{label}</th>{months.map((month) => <td key={month.month} data-label={monthLabel(month.month)}>{formatHoursMinutes(value(month))}</td>)}<td data-label="Total"><strong>{formatHoursMinutes(total)}</strong></td></tr>
}
