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
| Merge all the slots of one day into a single copied line (`lun. 21/09 · 4,38 h`), per category | One absence day is often stored as two consecutive Google events (one with prépa, one without); two lines for the same day read as a duplication. | 2026-09-30 |
| Replacement wizard scope = option A: absent person → replacement only; "À déterminer" sessions stay on the dashboard page | The product owner already has a dedicated page for unassigned sessions and does not want the wizard to handle direct assignment. | 2026-10-01 |
| Freeze `Date` in `src/test/setup.ts` to 2026-09-30 instead of letting tests read the wall clock | 6 tests silently assumed "today = September" and broke at the October rollover; a pinned clock keeps every suite deterministic forever (fake timers were rejected: they hang Testing Library's `waitFor`). | 2026-10-01 |
| Distinguish CDI worked hours from contract-credited hours | Absences cannot erase work performed; replacements count as performed work and toward annual-contract progress. Preserve existing holiday, sick-leave and payroll calculation rules pending real-data reconciliation. | 2026-10-01 |
| Adjust CDI annual remainder target by absences and replacements, counting replacements as performed work too | User-confirmed example: 100 h contract, 10 h absence, 5 h replacement, 60 h ordinary work → 95 h adjusted target, 65 h performed, 30 h remaining. Leave payroll calculations unchanged. | 2026-10-01 |
| Apply the same annual-remainder and worked-hours rules to CDII | User explicitly requested CDII too. Replacement hours increase both the adjusted target and worked hours. | 2026-10-01 |
| Calculate CDI/CDII total due from the adjusted contract guarantee | User confirmed `contract + replacements - absences` as guaranteed base when work falls short. Above it use performed hours; CDI adds calculated holidays and selected 10% or bulletin leave, while CDII calendar holidays count as performed and have no extra leave. | 2026-10-01 |
| Remove the absence deduction from the CDI holiday-coefficient base | Aligns the coefficient input with the corrected principle that absences never reduce worked time; otherwise the annual summary showed two contradictory figures for an absent CDI. | 2026-10-01 |
| Show an explicit formula note for every contract type in the annual summary | Admins and employees must understand how each figure is produced; the rule note now covers CDI, CDII, CDD and independents, and the total-due card states the CDII max() formula. | 2026-10-01 |
| Count sick leave as worked time and as bulletin hours; remainder = objective - worked | User-confirmed: worked hours = contract + replacements + sick leave; objective = contract - absences + replacements; remainder = objective - worked (fériés excluded from the comparison); sick leave also added to bulletin totals. | 2026-10-01 |
| CDI/CDII total due = guaranteed base + leave, where base = objective + fériés if hours remain else worked + fériés | Confirmed via the clarification questions; CDI adds 10% theoretical or payslip leave, CDII adds none and counts calendar holidays as worked. | 2026-10-01 |
| CDI paid leave theoretical = 10% of the base alone `max(HCAR, HT)`, excluding public holidays | User spec: HP = base + fériés + 10% × base. The previous code computed 10% of (base + fériés); confirmed via clarification that fériés are not marked up. | 2026-10-01 |
| CDI holiday coefficient base = `max(HCAR, HT)` (HCAR/1582 below, HT/1582 above) | User spec. Replaces the earlier contract/self-consistent coefficient; keeps the rule simple and readable in the UI. | 2026-10-01 |
| Keep sick leave counted as worked time (HT) and as bulletin hours | User confirmed. Mathematically equivalent to lowering the annual target by the sick hours; the employee reaches the objective with fewer real hours (deliberate, favourable choice). | 2026-10-01 |
