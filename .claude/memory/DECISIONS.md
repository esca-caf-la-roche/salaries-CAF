# Decisions

- Contract types are derived from resource-calendar prefixes: CDI, CDII, CDD, and Indep.
- Independent workers have no annual contract-hour target; their actual timed events are counted without preparation coefficients or automatic additions.
- `(CDII)-A DETERMINER` is an admin-only pseudo-resource for unassigned sessions and never receives an employee account.
- School-year reporting uses September through August.
- Overview warnings for unassigned sessions use a seven-day horizon.
- Production deploys only after lint, unit tests, and build pass.

| Decision | Rationale | Date |
|----------|-----------|------|
| Keep the overview annual-only, with a season selector | Comparing against an annual contract while filtering a person or month produced a misleading summary. | 2026-09-07 |
| Use `calculateAnnualSummary().contractualRealizedHours` for actual hours | It preserves the already-tested CDI, CDII/CDD, and independent business rules. | 2026-09-07 |
| Show no contract variance for independents | Independent workers have no annual guarantee; comparing their time with zero would create a false surplus. | 2026-09-07 |
| Keep J-7 as a rolling, client-side seven-day window | This matches the existing `isEventWithinNextDays` behavior and avoids a database migration for the overview redesign. | 2026-09-07 |
| Let CDI users choose the paid-leave source applied to the total due | The total from payslips remains factual; selecting theoretical or payslip leave changes only the leave included in the amount due and makes the balance understandable. | 2026-09-07 |
| Default the CDI paid-leave selector to theoretical leave | This preserves the previous total-due and balance behavior while exposing the choice explicitly. | 2026-09-07 |
| Park the unfinished Codex replacement-management work on `wip/gestion-remplacements` and restore `main` to `origin/main` | The uncommitted frontend/backend changes were mutually misaligned (different action names and payloads); a clean baseline avoids shipping a broken flow and nothing is lost. | 2026-09-07 |
| PSA copy report uses decimal hours only (`2,50 h`), coefficient included; screen keeps `h:mm` | PSA and the Bulletins page (`formatPayrollHours`) work in decimal hours; a payroll clerk can misread `2:30` as `2,30 h`. | 2026-09-29 |
| Refuse the monthly copy when the slots do not sum to the monthly totals (tolerance 0,006 h) | `monthly_hours` rounds to 2 decimals, so 0,005 h is the only legitimate gap; anything bigger is a bug and must never reach PSA. The month detail is reloaded on refusal. | 2026-09-29 |
| Round each copied slot to the centième with largest-remainder apportionment | Guarantees the printed lines add up exactly to `monthly_hours`, the figure shown on screen. | 2026-09-29 |
| Keep absences and replacements in two separate groups in both the UI and the copy report | The product owner requires them never mixed for the PSA handoff. | 2026-09-29 |
| One line per slot in the PSA copy: date + decimal hours only (no times, no title, no coefficient mention, no season line) | The product owner reviewed the real output: too much information drowned the figures. | 2026-09-29 |
