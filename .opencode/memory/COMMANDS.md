# Commands

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `supabase migration list`
- Production migration history diverges: use targeted `supabase db query --linked -f <migration>` after review, not a global `db push`.
- If pnpm is not on PATH: `npm exec --yes --package=pnpm@10 -- pnpm test` (or lint/build).
- Edge type check: `npm exec --yes --package=deno -- deno check supabase/functions/google-calendar-scheduled-sync/index.ts supabase/functions/google-calendar-sync/index.ts`.
- Cron acceptance (inactive job only): `supabase db query --linked -f supabase/tests/calendar_cron_smoke.sql`; inspect HTTP responses separately after commit. Executes real synchronization for enabled resources.
- Shared engine edits require deploy of sync + scheduled-sync; `_shared/google.ts` edits also require both OAuth consumers.
