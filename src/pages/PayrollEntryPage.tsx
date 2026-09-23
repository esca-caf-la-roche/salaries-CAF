import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronDown, Save } from 'lucide-react'
import { monthLabel, schoolYearForDate } from '../lib/format'
import { formatPayrollHours, parsePayrollHours } from '../lib/payroll'
import { getPayrollEntryPage, savePayrollMonth } from '../services/api'
import type { RecordedPayrollMonth } from '../types'

const schoolMonths = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8]

export function PayrollEntryPage() {
  const today = new Date()
  const [schoolYear, setSchoolYear] = useState(() => schoolYearForDate(today))
  const [month, setMonth] = useState(() => today.getMonth() + 1)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [names, setNames] = useState<Record<string, string>>({})
  const [recordedMonths, setRecordedMonths] = useState<RecordedPayrollMonth[]>([])
  const [loading, setLoading] = useState(true)
  const [loadedPeriod, setLoadedPeriod] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadedPeriod('')
    setDrafts({})
    setNames({})
    setMessage('')
    setError('')
    void getPayrollEntryPage(schoolYear, month).then(({ workers, recordedMonths: recorded }) => {
      if (cancelled) return
      setDrafts(Object.fromEntries(workers.map((worker) => [worker.employeeId, formatPayrollHours(worker.paidHundredthHours)])))
      setNames(Object.fromEntries(workers.map((worker) => [worker.employeeId, worker.employeeName])))
      setRecordedMonths(recorded)
      setLoadedPeriod(`${schoolYear}-${month}`)
    }).catch(() => {
      if (!cancelled) setError('Les bulletins n’ont pas pu être chargés.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [schoolYear, month])

  const periodLoaded = loadedPeriod === `${schoolYear}-${month}`
  const invalidIds = useMemo(() => Object.entries(drafts)
    .filter(([, value]) => parsePayrollHours(value) == null)
    .map(([id]) => id), [drafts])

  const selectRecordedMonth = (recorded: RecordedPayrollMonth) => {
    setSchoolYear(recorded.schoolYear)
    setMonth(recorded.month)
  }

  const save = async () => {
    if (!periodLoaded || invalidIds.length || !Object.keys(drafts).length) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      await savePayrollMonth(schoolYear, month, Object.entries(drafts).map(([employeeId, value]) => ({
        employeeId,
        employeeName: names[employeeId],
        paidHundredthHours: parsePayrollHours(value)!,
      })))
      setRecordedMonths((current) => {
        const next = current.filter((item) => item.schoolYear !== schoolYear || item.month !== month)
        return [{ schoolYear, month, employeeCount: Object.keys(drafts).length }, ...next]
      })
      setMessage(`Bulletins de ${monthLabel(month)} enregistrés.`)
    } catch {
      setError('L’enregistrement a échoué. Vérifiez vos droits puis réessayez.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="page payroll-page">
    <header className="page-heading">
      <div><p className="eyebrow">Administration · Bulletins</p><h1>Heures payées</h1><p>Saisissez en une fois les heures du bulletin de chaque moniteur pour le mois choisi.</p></div>
    </header>

    {recordedMonths.length > 0 && <section className="payroll-history" aria-labelledby="recorded-months-title">
      <div><CalendarDays aria-hidden="true" /><span><strong id="recorded-months-title">Mois enregistrés</strong><small>Sélectionnez un mois pour le modifier</small></span></div>
      <div className="payroll-history__months">{recordedMonths.map((recorded) => <button key={`${recorded.schoolYear}-${recorded.month}`} type="button" className={recorded.schoolYear === schoolYear && recorded.month === month ? 'active' : ''} onClick={() => selectRecordedMonth(recorded)}>{monthLabel(recorded.month)} {recorded.month >= 9 ? recorded.schoolYear : recorded.schoolYear + 1}<small>{recorded.employeeCount} BE</small></button>)}</div>
    </section>}

    <section className="panel payroll-panel">
      <div className="panel-heading payroll-panel__heading"><div><p className="eyebrow">Période</p><h2>{monthLabel(month)} {month >= 9 ? schoolYear : schoolYear + 1}</h2></div><div className="payroll-period">
        <label><span>Saison</span><div className="select-wrap"><select aria-label="Saison" value={schoolYear} onChange={(event) => setSchoolYear(Number(event.target.value))}>{[schoolYear - 1, schoolYear, schoolYear + 1].map((year) => <option key={year} value={year}>{year}–{year + 1}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>
        <label><span>Mois</span><div className="select-wrap"><select aria-label="Mois" value={month} onChange={(event) => setMonth(Number(event.target.value))}>{schoolMonths.map((item) => <option key={item} value={item}>{monthLabel(item)}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>
      </div></div>

      {error && <div className="alert alert--error payroll-alert" role="alert">{error}</div>}
      {message && <div className="alert alert--success payroll-alert" role="status"><Check aria-hidden="true" />{message}</div>}
      {loading ? <div className="payroll-loading"><span className="spinner" />Chargement des moniteurs…</div> : <div className="payroll-list">
        {Object.keys(drafts).length === 0 ? <p className="payroll-empty">Aucun BE actif à renseigner.</p> : Object.entries(drafts).map(([employeeId, value]) => <label className="payroll-worker" key={employeeId}><span><strong>{names[employeeId]}</strong><small>Heures payées sur le bulletin</small></span><span className="payroll-input"><input aria-label={`Heures payées pour ${names[employeeId]}`} inputMode="decimal" value={value} onChange={(event) => setDrafts((current) => ({ ...current, [employeeId]: event.target.value }))} aria-invalid={invalidIds.includes(employeeId)} /><small>heures</small></span></label>)}
      </div>}
      <footer className="payroll-footer"><span>{invalidIds.length ? 'Utilisez un nombre positif avec deux décimales maximum.' : `${Object.keys(drafts).length} moniteur${Object.keys(drafts).length > 1 ? 's' : ''} à enregistrer`}</span><button className="button button--primary" type="button" onClick={() => void save()} disabled={!periodLoaded || loading || saving || invalidIds.length > 0 || !Object.keys(drafts).length}><Save aria-hidden="true" />{saving ? 'Enregistrement…' : 'Enregistrer le mois'}</button></footer>
    </section>
  </div>
}
