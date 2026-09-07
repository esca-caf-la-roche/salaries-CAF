# Project state

- Project: La Cordée — suivi des heures CAF
- Phase: production application, actively maintained
- Current branch: `main`, tracking `origin/main`
- Current focus: overview redesign completed and awaiting production deployment verification.
- Deployment: GitHub Pages through `.github/workflows/deploy-pages.yml` after lint, tests, and build.

## Recent completed work

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
- Verification completed locally: lint, TypeScript, 86 unit tests, production build, and browser visual review.
