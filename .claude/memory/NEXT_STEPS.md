# Next steps

## Immediate

- [ ] Reconcile Jérôme's September events and decimal-hour figures with the new CDI worked-hours and contract-credit displays; no production data was available locally.
- [ ] Review and merge the uncommitted CDI hours fix through a PR before deployment; tests (162), lint and build passed locally on 2026-10-01.

- [x] Test date-freeze shipped: PR #12 merged into `main` on 2026-10-01 (commit `9f614cc`), CI green, GitHub Pages redeployed. `src/test/setup.ts` pins "today" to 2026-09-30 (local components).
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

- [ ] Add at least one explicitly-dated first-of-month boundary test: with the clock pinned to month-end (Sept 30), first-of-month paths (`previousSchoolMonth` on the 1st, default-month selection on the 1st) are never exercised.
- [ ] If required, turn J-7 monitor gaps into persisted/scheduled notifications rather than dashboard-only tasks.
