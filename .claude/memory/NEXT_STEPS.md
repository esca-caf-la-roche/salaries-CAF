# Next steps

## Immediate

- [ ] Commit + PR the test date-freeze fix (`src/test/setup.ts` pins "today" to 2026-09-30): 6 tests in `TimeTrackingPage` / `PayrollEntryPage` were silently date-dependent and broke on 2026-10-01 (they expected September). Lint + build + 160/160 tests green locally on 2026-10-01. Push to `main` requires the usual PR flow.
- [x] Validate the new "Copier le mois" report against real data — tested by the user on 2026-10-01, OK (decimal format confirmed 2026-09-29).
- [x] Feature scope decided (2026-10-01): **option A** — absent-person-only workflow. Unassigned ("À déterminer") sessions stay on the existing dashboard page; no direct assignment in the replacement wizard.
- [x] Front/back realignment — turned out to be ALREADY DONE on `main`: the wizard (`be1686f`, refreshed by `44feb41`) calls `replacementMonthEvents` / `replacementAvailability` / `processReplacements` with exactly the signatures the edge function expects (month is sent 1-based, page passes `getMonth() + 1`). Branch `wip/gestion-remplacements` (commit `1bb9adc`) is the superseded pre-alignment state — safe to delete.
- [x] Quality gates run on 2026-10-01: lint OK, tests 160/160 OK, build OK.

## Notes

- Google scope on `main` is already the broad `calendar` scope (see `_shared/google.ts`): existing Google accounts must be reconnected once so the refresh token carries write access — expected by the replacement wizard.
- Absence/replacement calendar IDs are hardcoded in the edge function — consider making them configurable before production.
- Test suites must stay date-independent: `src/test/setup.ts` freezes `Date` to 2026-09-30 (the last date the suite was verified green on). Do not add real-clock assumptions in tests.
- `.git/info/exclude` locally ignores scratch dirs (`Gcsript/`, `screen/`, `.claude-plugins/`).

## Backlog

- [ ] If required, turn J-7 monitor gaps into persisted/scheduled notifications rather than dashboard-only tasks.
