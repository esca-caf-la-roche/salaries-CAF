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
