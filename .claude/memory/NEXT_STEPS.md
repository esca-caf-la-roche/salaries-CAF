# Next steps

## Immediate

- [ ] Decide feature scope with the user: (A) absent-person-only workflow, or (B) also support direct assignment of unassigned ("À déterminer") sessions.
- [ ] Realign frontend (`api.ts`, `ReplacementManagementPage`) with edge function actions `replacementMonthEvents` / `replacementAvailability` / `processReplacement` — work is preserved on branch `wip/gestion-remplacements` (commit `1bb9adc`).
- [ ] After realignment: add regression tests, run lint + tests + build, then merge to `main`.

## Notes

- Google scope was broadened from `calendar.readonly` to `calendar` in the WIP; existing Google accounts must be reconnected once for the new write permissions.
- Absence/replacement calendar IDs are hardcoded in the edge function — consider making them configurable before production.
- `.git/info/exclude` locally ignores scratch dirs (`Gcsript/`, `screen/`, `.claude-plugins/`).

## Backlog

- [ ] If required, turn J-7 monitor gaps into persisted/scheduled notifications rather than dashboard-only tasks.
