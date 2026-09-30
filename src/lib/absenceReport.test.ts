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

    expect(report).toMatch(/^Absences et remplacements — septembre 2026\n\n/)
    expect(report).not.toContain('Saison')
    expect(report).toContain('Camille Martin\nAbsences — 2,50 h')
    expect(report).toContain('  jeu. 03/09 · 2,50 h')
    expect(report).toContain('Remplacements — 1,25 h')
    expect(report).toContain('  sam. 05/09 · 1,25 h')
    expect(report).toContain('Morgan Durand\nAbsences — 0,00 h')
    expect(report).toContain('  sam. 05/09 · 3,00 h')
    expect(report).toContain('Total septembre 2026 — Absences : 2,50 h · Remplacements : 4,25 h')
    expect(report.indexOf('jeu. 03/09')).toBeLessThan(report.indexOf('sam. 05/09'))
    expect(report.indexOf('Camille Martin')).toBeLessThan(report.indexOf('Morgan Durand'))
  })

  it('renders the whole report with the exact structure expected by the payroll company', () => {
    const report = buildAbsenceMonthReport(2026, 9, [{ employee: monitor('employee-1', 'Camille Martin'), events: [absenceSlot, replacementSlot] }])

    expect(report).toBe([
      'Absences et remplacements — septembre 2026',
      '',
      'Camille Martin',
      'Absences — 2,50 h',
      '  jeu. 03/09 · 2,50 h',
      'Remplacements — 1,25 h',
      '  sam. 05/09 · 1,25 h',
      '',
      'Total septembre 2026 — Absences : 2,50 h · Remplacements : 1,25 h',
    ].join('\n'))
  })

  it('keeps a copied line down to the date and the decimal hours only', () => {
    const report = buildAbsenceMonthReport(2026, 9, [{ employee: monitor('employee-1', 'Camille Martin'), events: [absenceSlot, replacementSlot] }])

    expect(report).toContain('  jeu. 03/09 · 2,50 h')
    expect(report).not.toContain('–')
    expect(report).not.toContain('Stage arkose')
    expect(report).not.toContain('× 1,25')
    expect(report).not.toContain('Saison')
  })

  it('keeps absence slots out of the replacement block even when categories mix', () => {
    const report = buildAbsenceMonthReport(2026, 9, [{ employee: monitor('employee-1', 'Camille Martin'), events: [absenceSlot, replacementSlot] }])

    const absenceBlock = report.slice(report.indexOf('Absences —'), report.indexOf('Remplacements —'))
    const replacementBlock = report.slice(report.indexOf('Remplacements —'), report.indexOf('Total septembre'))

    expect(absenceBlock).toContain('jeu. 03/09')
    expect(absenceBlock).not.toContain('sam. 05/09')
    expect(replacementBlock).toContain('sam. 05/09')
    expect(replacementBlock).not.toContain('jeu. 03/09')
  })

  it('rounds each day to the centième while the totals stay the exact sum of the lines', () => {
    const longSlot: MonthlyEventHour = { ...absenceSlot, id: 'event-long', weightedHours: 100 / 60, rawHours: 80 / 60 }
    const report = buildAbsenceMonthReport(2026, 9, [{
      employee: monitor('employee-1', 'Camille Martin'),
      events: [longSlot, { ...longSlot, id: 'event-long-2', startsAt: '2026-09-05T07:00:00Z', endsAt: '2026-09-05T09:00:00Z' }],
    }])

    // 3,3333 h : monthly_hours affiche 3,33 h — les lignes doivent additionner à ce même total.
    expect(report).toContain('Absences — 3,33 h')
    expect(report).toContain('  jeu. 03/09 · 1,67 h')
    expect(report).toContain('  sam. 05/09 · 1,66 h')
    expect(report).toContain('Total septembre 2026 — Absences : 3,33 h · Remplacements : 0,00 h')
  })

  it('merges all the slots of one day into a single line', () => {
    const before: MonthlyEventHour = {
      ...absenceSlot, id: 'event-21a', title: 'Absence avec prépa',
      startsAt: '2026-09-21T15:00:00Z', endsAt: '2026-09-21T17:30:00Z',
      rawHours: 2.5, weightedHours: 3.125, coefficient: 1.25, hasPreparation: true,
    }
    const after: MonthlyEventHour = {
      ...absenceSlot, id: 'event-21b', title: 'Absence avec prépa',
      startsAt: '2026-09-21T17:30:00Z', endsAt: '2026-09-21T18:45:00Z',
      rawHours: 1.25, weightedHours: 1.25, coefficient: 1, hasPreparation: false,
    }
    const report = buildAbsenceMonthReport(2026, 9, [{ employee: monitor('employee-1', 'Jérôme GUYOT'), events: [before, after] }])

    expect(report).toContain('Absences — 4,38 h')
    expect(report).toContain('  lun. 21/09 · 4,38 h')
    expect(report.split('\n').filter((line) => line.startsWith('  '))).toHaveLength(1)
    expect(report).toContain('Total septembre 2026 — Absences : 4,38 h · Remplacements : 0,00 h')
  })

  it('merges the slots of a day even when they are separated by a lunch break or come from different calendars', () => {
    const report = buildAbsenceMonthReport(2026, 9, [{
      employee: monitor('employee-1', 'Camille Martin'),
      events: [absenceSlot, { ...absenceSlot, id: 'event-absence-2', title: 'Absence sans prépa', calendarName: 'Sans prépa', coefficient: 1, hasPreparation: false, weightedHours: 1, rawHours: 1, startsAt: '2026-09-03T11:00:00Z', endsAt: '2026-09-03T12:00:00Z' }],
    }])

    expect(report).toContain('Absences — 3,50 h')
    expect(report.split('\n').filter((line) => line.startsWith('  '))).toHaveLength(1)
    expect(report).toContain('  jeu. 03/09 · 3,50 h')
  })

  it('attributes a slot crossing midnight to its starting day and groups a DST day once', () => {
    const nightEnd = '2026-09-21T23:00:00Z' // 01:00 le 22/09 à Paris
    const report = buildAbsenceMonthReport(2026, 9, [{
      employee: monitor('employee-1', 'Camille Martin'),
      events: [{ ...absenceSlot, id: 'event-night', startsAt: '2026-09-21T21:00:00Z', endsAt: nightEnd, rawHours: 2, weightedHours: 2, coefficient: 1, hasPreparation: false }],
    }])

    expect(report).toContain('  lun. 21/09 · 2,00 h')
    expect(report).not.toContain('22/09')

    // 25/10/2026 : heure d'été → 02:30 est vu deux fois (00:30Z puis 01:30Z). Une seule ligne.
    const dstDay = buildAbsenceMonthReport(2026, 10, [{
      employee: monitor('employee-1', 'Camille Martin'),
      events: [
        { ...absenceSlot, id: 'event-dst-1', startsAt: '2026-10-25T00:30:00Z', endsAt: '2026-10-25T01:30:00Z', rawHours: 1, weightedHours: 1, coefficient: 1, hasPreparation: false },
        { ...absenceSlot, id: 'event-dst-2', startsAt: '2026-10-25T01:30:00Z', endsAt: '2026-10-25T02:30:00Z', rawHours: 1, weightedHours: 1, coefficient: 1, hasPreparation: false },
      ],
    }])

    expect(dstDay).toContain('Absences — 2,00 h')
    expect(dstDay).toContain('  dim. 25/10 · 2,00 h')
    expect(dstDay.split('\n').filter((line) => line.startsWith('  '))).toHaveLength(1)
  })

  it('distributes the rounding so the printed lines add up to the monthly total', () => {
    const shortSlot: MonthlyEventHour = { ...absenceSlot, id: 'event-short', weightedHours: 20 / 60, rawHours: 16 / 60, coefficient: 1, hasPreparation: false }
    const report = buildAbsenceMonthReport(2026, 9, [{
      employee: monitor('employee-1', 'Camille Martin'),
      events: [
        shortSlot,
        { ...shortSlot, id: 'event-short-2', startsAt: '2026-09-04T07:00:00Z', endsAt: '2026-09-04T08:00:00Z' },
        { ...shortSlot, id: 'event-short-3', startsAt: '2026-09-05T07:00:00Z', endsAt: '2026-09-05T08:00:00Z' },
      ],
    }])

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
