# Decisions

| Decision | Rationale | Date |
|---|---|---|
| Use query parameters for validation deep links | Opens the selected employee, school season, and month directly without adding a route per task. | 2026-10-03 |
| Require explicit admin approval of employee validation | Makes the existing admin review notification actionable and traceable. | 2026-10-03 |
| Sync calendars daily at 04:17 UTC rather than weekly | Useful fresh data and margin against Free's 7-day inactivity window; no guarantee against pausing, only paid plans guarantee this. | 2026-10-14 |
| Dedicated cron secret in Vault and Edge secrets | Scheduler cannot invoke other admin actions; no service-role credential in job text. | 2026-10-14 |
| Dispatch one calendar per request, retry stale resources at 04:37 UTC | Isolates slow providers, retries after ten-minute locks expire, aborts scheduled Google fetch/backoff at 80 seconds. Database calls remain outside that budget. | 2026-10-14 |
| Migration creates the cron inactive | Validate real Vault/pg_net/Edge/Google path before explicit activation; reapplication intentionally disables it. | 2026-10-14 |
