import { describe, expect, it } from 'vitest'
import { buildAbsenceMonthReport } from './absenceReport'
import type { EmployeeSummary, MonthlyEventHour } from '../types'

const monitor = (id: string, name: string): EmployeeSummary => ({
  id, name, calendarName: '', contractType: 'CDI', annualContractHours: 800, paidMonths: 12, annualWorkedWeeks: 0,
  settings: { contractType: 'CDI', annualContractMinutes: 48000, fullTimeAnnualMinutes: 94920, paidMonths: 12 }, payroll: [],
  monthlyHours: [],
})

const absenceSlot: MonthlyEventHour = {
  id: 'event-absence', title: 'Stage arkose', calendarName: 'Avec prépa', calendarColor: null,
  startsAt: '2026-09-03T07:00:00Z', endsAt: '2026-09-03T09:00:00Z', rawHours: 2, weightedHours: 2.5,
  coefficient: 1.25, hourCategory: 'absence', hasPreparation: true,
}

const replacementSlot: MonthlyEventHour = {
  id: 'event-replacement', title: 'Cours bébés', calendarName: 'Remplacements', calendarColor: null,
  startsAt: '2026-09-05T13:00:00Z', endsAt: '2026-09-05T14:15:00Z', rawHours: 1.25, weightedHours: 1.25,
  coefficient: 1, hourCategory: 'replacement', hasPreparation: false,
}

describe('buildAbsenceMonthReport', () => {
  it('lists each monitor with absences and replacements in separate blocks', () => {
    const report = buildAbsenceMonthReport(2026, 9, [
      { employee: monitor('employee-1', 'Camille Martin'), events: [absenceSlot, replacementSlot] },
      { employee: monitor('employee-2', 'Morgan Durand'), events: [{ ...replacementSlot, id: 'event-morgan', title: 'Accompagnement', weightedHours: 3, rawHours: 3 }] },
    ])

    expect(report).toMatch(/^Absences et remplacements — septembre 2026\nSaison 2026–2027\n/)
    expect(report).toContain('Camille Martin\nAbsences — 2,50 h')
    expect(report).toMatch(/03\/09 09:00–11:00 · Stage arkose · 2,50 h \(× 1,25\)/)
    expect(report).toContain('Remplacements — 1,25 h')
    expect(report).toMatch(/05\/09 15:00–16:15 · Cours bébés · 1,25 h/)
    expect(report).toContain('Morgan Durand\nAbsences — 0,00 h')
    expect(report).toContain('Accompagnement · 3,00 h')
    expect(report).toContain('Total septembre 2026 — Absences : 2,50 h · Remplacements : 4,25 h')
    expect(report.indexOf('Stage arkose')).toBeLessThan(report.indexOf('Cours bébés'))
    expect(report.indexOf('Camille Martin')).toBeLessThan(report.indexOf('Morgan Durand'))
  })

  it('keeps absence slots out of the replacement block even when categories mix', () => {
    const report = buildAbsenceMonthReport(2026, 9, [{ employee: monitor('employee-1', 'Camille Martin'), events: [absenceSlot, replacementSlot] }])

    const absenceBlock = report.slice(report.indexOf('Absences —'), report.indexOf('Remplacements —'))
    const replacementBlock = report.slice(report.indexOf('Remplacements —'), report.indexOf('Total septembre'))

    expect(absenceBlock).toContain('Stage arkose')
    expect(absenceBlock).not.toContain('Cours bébés')
    expect(replacementBlock).toContain('Cours bébés')
    expect(replacementBlock).not.toContain('Stage arkose')
  })

  it('rounds each slot to the centième while the totals stay the exact sum of the lines', () => {
    const longSlot: MonthlyEventHour = { ...absenceSlot, id: 'event-long', weightedHours: 100 / 60, rawHours: 80 / 60 }
    const report = buildAbsenceMonthReport(2026, 9, [{ employee: monitor('employee-1', 'Camille Martin'), events: [longSlot, { ...longSlot, id: 'event-long-2' }] }])

    // 3,3333 h : monthly_hours affiche 3,33 h — les lignes doivent additionner à ce même total.
    expect(report).toContain('Absences — 3,33 h')
    expect(report).toContain('Stage arkose · 1,67 h (× 1,25)')
    expect(report).toContain('Total septembre 2026 — Absences : 3,33 h · Remplacements : 0,00 h')
  })

  it('distributes the rounding so the printed lines add up to the monthly total', () => {
    const shortSlot: MonthlyEventHour = { ...absenceSlot, id: 'event-short', weightedHours: 20 / 60, rawHours: 16 / 60, coefficient: 1, hasPreparation: false }
    const report = buildAbsenceMonthReport(2026, 9, [{ employee: monitor('employee-1', 'Camille Martin'), events: [shortSlot, { ...shortSlot, id: 'event-short-2' }, { ...shortSlot, id: 'event-short-3' }] }])

    const slotLines = report.split('\n').filter((line) => line.startsWith('  '))
    expect(slotLines).toHaveLength(3)
    expect(slotLines.filter((line) => line.endsWith('0,34 h'))).toHaveLength(1)
    expect(slotLines.filter((line) => line.endsWith('0,33 h'))).toHaveLength(2)
    expect(report).toContain('Absences — 1,00 h')
    expect(report).toContain('Total septembre 2026 — Absences : 1,00 h · Remplacements : 0,00 h')
  })

  it('labels a mid-year month with its calendar year', () => {
    const report = buildAbsenceMonthReport(2026, 1, [{ employee: monitor('employee-1', 'Camille Martin'), events: [] }])

    expect(report).toContain('Absences et remplacements — janvier 2027')
    expect(report).toContain('Total janvier 2027 — Absences : 0,00 h · Remplacements : 0,00 h')
  })
})
