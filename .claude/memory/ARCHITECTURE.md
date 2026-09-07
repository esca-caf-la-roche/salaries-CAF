# Architecture

- Frontend: React 18, TypeScript, React Router, Vite.
- Backend: Supabase PostgreSQL, RLS, Edge Functions, and Google Calendar synchronization.
- Styling: shared CSS in `src/styles.css`.
- Pages: dashboard, configuration, time tracking, independent events, and unassigned events in `src/pages`.
- Shared client API: `src/services/api.ts`.
- Business calculations: `src/lib`.
- Overview recap calculation: `src/lib/workerRecap.ts`, delegating contract-specific rules to `annualSummary.ts`.
- Tests: Vitest and Testing Library; Supabase SQL tests under `supabase/tests/database`.
- Delivery: GitHub Actions deploys the Vite `dist` output to GitHub Pages.

## Key flows

1. Calendar events are synchronized into Supabase.
2. Calendar categories determine contract, absence, replacement, and holiday totals.
3. Annual summaries derive actual hours and contract variance by contract type.
4. Notifications surface monthly validations and operational alerts.
5. The admin overview aggregates all monthly hours for the selected school year and presents one annual row per active worker.
