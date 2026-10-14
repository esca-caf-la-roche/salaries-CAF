# Calendar cron acceptance — 2026-10-14

Production target: `ucopmjqryaktcafgczpp`. No subscription change.

## Verified before activation

- 192 Vitest tests, lint, build pass. Build retains its existing large-chunk warning.
- Deno type check passes for interactive and scheduled sync entrypoints.
- Tech lead and antagonist reviews led to side-effect-free shared engine extraction, per-resource dispatch, abortable Google retries, safe failure logs and inactive installation.
- Sync, scheduled-sync and both OAuth functions deployed (shared Google module is bundled per function).
- Dedicated random 256-bit secret provisioned in Edge secrets and Vault; existing Edge secret digests retained.
- Migration successfully applied twice: exactly one job, `17,37 4 * * *`, inactive throughout acceptance. An intermediate CLI request timed out; the retry succeeded and the job state was checked.
- One active shared Google connection, 10 enabled resource calendars.
- Missing/wrong scheduler credentials: HTTP 401. Vault-authenticated malformed body: HTTP 400.
- Interactive function reached its own handler using a non-user public JWT and rejected it with HTTP 401 `Session invalide`; no authentication bypass introduced.
- Actual Vault → pg_net → Edge → Google dispatch: request IDs 2–11 returned HTTP 200 with `ok:true`, `calendars:1`, `failed:0`; request 12 returned the expected 400.
- All ten calendars refreshed at 06:12:23–24 UTC; `sync_status=success`, `sync_error=null`, locks released. Ten incremental `sync_runs` succeeded in 0.35–0.65 seconds.
- Executing the stored cron command while all resources were fresh generated no dispatches, validating stale-only filtering. Explicit smoke requests exercised real synchronization without changing stored timestamps or invalidating tokens.
- Unit tests cover expired budget, interrupted 30-second Retry-After, busy-lock retry response, unknown resource, authentication and partial failures.

## Limitations retained

- Deliberately did not revoke/expire the shared OAuth token or invalidate production sync tokens solely for testing. Concurrent expired-token refresh and worst-case full synchronization are not verified.
- 80-second cancellation bounds Google calls/backoff and checkpoints, not database operations or total worker lifetime. Pagination is replayed from the preserved sync token; no page checkpoint added.
- No new scheduler email alert. Inspect HTTP responses, Edge logs and calendar/run states as documented in `supabase/README.md`.
- Useful daily activity reduces Free-plan inactivity risk; only a paid plan guarantees exclusion from automatic pause.

Final QA approved monitored activation. Job 1 explicitly activated on 2026-10-14; readback confirmed `active=true`, schedule `17,37 4 * * *`. First actual scheduled execution remains to inspect (next 04:17/04:37 UTC cycle). PR status is recorded in project memory.
