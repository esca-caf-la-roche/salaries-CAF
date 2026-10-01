# Project state

- Project: La Cordée — suivi des heures CAF
- Phase: production application, actively maintained
- Annual-hours review (2026-10-01, branch `fix/cdi-cp-base-and-holiday-coefficient`): CDI paid leave is now **10 % of the base alone `max(HCAR, HT)`, excluding public holidays** (was 10 % of base + fériés); the CDI holiday coefficient base is now `max(HCAR, HT)` divided by 1582 (was HCA/self-consistent). Working hours (HT), objective (HCAR), remainder, CDII rules and sick-leave handling are unchanged. HCAR/HT now come from a single `resolveContractBases` helper shared by the summary, the dashboard and the tracking page. 170 tests, lint and build pass locally. Front, README and memory realigned.
- Local follow-up (2026-10-01, not deployed): CDI/CDII worked hours = contract events + replacements + sick leave; objective = contract - absences + replacements; remainder = objective - worked hours; sick leave also counts as bulletin hours. Guaranteed base = objective + holidays if hours remain else worked + holidays; CDI total due adds 10% or payslip leave, CDII adds none and counts calendar holidays as worked. CDI holiday-coefficient base no longer deducts absences. 168 tests, lint and build pass locally.
- Current branch work (2026-10-01): `fix/cdi-worked-hours-separate-contract` separates CDI worked hours (contract-category events + replacements) from hours credited toward the annual contract (worked + holidays - absences + sick leave). Monthly tracking, annual recap and admin overview updated; dashboard holidays now follow the same CDI calculation as tracking. 163 tests, lint and build pass locally. Not yet deployed; Jérôme's actual September data has not been reconciled.
- Current branch: `main`, tracking `origin/main` (PR #12 merged 2026-10-01, CI green, Pages redeployed)
- Current focus: PSA payroll-detail feature shipped (PR #9 merged 2026-09-29, format slimmed in PR #10, same-day merge in PR #11 — live on GitHub Pages). The Absences & remplacements page expands per monitor into two strictly separate slot groups (Absences / Remplacements) plus a "Copier le mois" button producing the monthly plain-text report for PSA.
- Deployment: GitHub Pages through `.github/workflows/deploy-pages.yml` after lint, tests, and build.
- Replacement feature: scope decided 2026-10-01 = **option A** (absent person → replacement only; "À déterminer" sessions stay on the dashboard page). Front/back realignment verified already done on `main`; branch `wip/gestion-remplacements` is superseded.
- Quality gates: on 2026-10-01, 6 date-dependent tests (TimeTrackingPage, PayrollEntryPage) broke at month rollover because they assumed "today = September". Fixed by freezing `Date` in `src/test/setup.ts` to 2026-09-30 (local components) — shipped via PR #12 (merged 2026-10-01): lint + tests (160/160) + build + CI all green.

## Recent completed work

- CI flake fix (PR #22, merged 2026-10-01, deployed): a Pages run failed on the pre-existing `TimeTrackingPage > shows the event-level monthly ledger...` test because Testing Library's default 1 s async timeout was too tight under CI load (identical build passed on re-run). `src/test/setup.ts` now sets `asyncUtilTimeout: 5000` and `vite.config.ts` sets `testTimeout: 15000` (ordered above it to keep RTL diagnostics). Tests only.
- Tracking page readability (PR #20, merged 2026-10-01, deployed): the annual decomposition renders one calculation per line (worked hours, objective, remainder), the CDI base/leave notes are split, a CDII never mentions paid leave, and the misleading monthly "Total pondéré" (which mixed absences into worked hours) was removed while the independent "Total réel" is kept. Display-only change.
- Added per-monitor slot details on the Absences & remplacements page (PR #9): Month → Monitor → separate Absences/Remplacements slot groups (date, times, title, hours with coefficient), lazy loading per monitor+month, and a "Copier le mois" clipboard report in decimal hours for PSA, guarded by a detail-vs-totals consistency check.
- Slimmed the PSA copy (PR #10) to `lun. 21/09 · 3,13 h` per line: no season line, no times, no title, no coefficient mention — the screen keeps times and coefficient. Merged same-day slots into a single line (PR #11), so two consecutive absences print `lun. 21/09 · 4,38 h`; grouping is per category, keyed on the Europe/Paris date, groups sorted chronologically, apportionment still makes lines add up exactly to `monthly_hours`.

- Replaced the analytical dashboard with an annual recap of every active employee and independent worker.
- Added contract-specific actual-hour calculations, accessible red/green variance states, and compact absence/replacement/holiday details.
- Consolidated pending validations, incomplete calendar configuration, and every unassigned session within the rolling J-7 window into one task board.
- Added responsive styling, an independent worker to demo data, and focused regression tests.
- Clarified CDI paid-leave accounting with an accessible theoretical/payslip selector, both leave totals, and the explicit theoretical formula.
- Annual tracking summaries and calculations.
- Independent-worker event and actual-hour views.
- Monthly CDI validation and validation notifications.
- Unassigned-event monitoring within seven days.

## Known constraints

- Supabase provides authentication, data, synchronization, and notifications.
- School years run from September 1 to August 31.
- The user authorized direct work on `main` and production deployment for the overview redesign.
- The user authorized direct work on `main` and production deployment for the CDI paid-leave selector.
- Pushes to `main` are guarded: antagonist review + horka-review-changes tech lead review are required, and GitHub now requires a PR (push to main rejected server-side).
- Google connections are SHARED (one active connection for the whole association, `sharedConnectionFor`), not per-user. OAuth callback keeps a single active connection and rejects a different Google account.
- The replacement-management WIP is parked on branch `wip/gestion-remplacements` (commit `1bb9adc`).
- The replacement-management feature is LIVE: admin page `/gerer-remplacements` (3-step wizard) + edge actions `replacementMonthEvents` / `replacementAvailability` / `processReplacements`. Absence/replacement calendar IDs are hardcoded constants in the edge function.
- Declined-resource detection is LIVE: sync stores attendees/htmlLink in `calendar_events.raw`; edge actions `declinedResourceEvents`, `repairResourceEvent` (with post-repair calendar resync), `resyncAll`; tasks appear in the Vue d'ensemble board with a Voir link and Corriger button.
- Remember: `supabase/functions/_shared/*.ts` changes require redeploying EVERY consumer function (google-calendar-sync, google-oauth-start, google-oauth-callback) — bundling happens per function at deploy time.
- PostgREST does NOT support supabase-js .filter("raw->attendees","is",null) — use internal_* RPCs for JSONB queries. Migration history prod/local diverged (remote has renamed 2026091813xxx migrations); apply migrations manually via `supabase db query -f` until history is repaired.
- Test edge functions end to end by minting an admin session: admin/generate_link (service key) → /auth/v1/verify → tokens from the redirect Location fragment.
