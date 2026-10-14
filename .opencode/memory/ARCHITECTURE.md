# Architecture

- React 18 + TypeScript + Vite frontend in `src/`.
- Supabase Auth, Postgres, and Edge Functions in `supabase/`.
- GitHub Actions deploys `dist/` to GitHub Pages on pushes to `main`.
- CDI monthly validations are stored in `monthly_time_validations`; notifications are stored in `user_notifications`.
- Scheduled Google sync uses Supabase Cron + pg_net + Vault and a dedicated Edge endpoint; reuses incremental sync, resource locks, and `sync_runs`. No employee/admin session in scheduler.
