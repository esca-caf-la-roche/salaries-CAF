# Project State

## Current
- CDI validation backend migration deployed to the linked production Supabase project.
- CDI validation navigation and admin approval merged in PR #25 (`1d49211`), now present on `main` (verified 2026-10-14).
- Daily Google Calendar sync on `feat/daily-calendar-sync`: dedicated secret-authenticated Edge endpoint, Supabase Cron at 04:17 UTC + stale-only retry at 04:37, Vault secret. 192 tests, lint, build and Deno type check pass. Tech lead and final QA approved; antagonist corrections applied. Four Edge functions deployed; actual Vault/pg_net dispatch synchronized all 10 resources (HTTP 200, 0.35–0.65 s incremental runs), authentication tests pass. Cron job 1 explicitly activated on 2026-10-14 after QA; reviewed PR pending. First automatic scheduled cycle remains to inspect.

## Done
- Mobile notification bell with unread badge.
- Direct validation links to employee, season, and month.
- Admin month approval UI and database migration.

## Blocker
- Historical push blocker for PR #25 resolved upstream. Current deployment must still go through a reviewed PR.
