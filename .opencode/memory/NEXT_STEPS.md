# Next Steps

## Immediate
- [x] CDI validation navigation and approval merged upstream in PR #25.
- [x] Daily calendar sync: reviewed, four functions deployed, real Vault/pg_net synchronization verified on 10 calendars.
- [x] Final QA and explicit production cron activation (job 1).
- [ ] Merge reviewed daily-calendar-sync PR.

## Short Term
- [ ] Manually test the mobile notification badge and an administrator approval with authenticated production data.
- [ ] Inspect first automatic daily cron execution (job + HTTP responses + calendar freshness).
- [ ] Add mocked coverage for concurrent expired-token refresh and oversized full-sync recovery; do not disrupt production credentials for tests.
