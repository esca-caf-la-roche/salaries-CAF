import '@testing-library/jest-dom/vitest'

// Freeze "today" so date-dependent views (default month, J-7 windows, previous-month
// validation) render the same state on every run. 2026-09-30 is a date the full suite
// was verified green on; without this, tests break whenever the real month changes.
// Built from LOCAL date components so the pinned calendar day is Sept 30 in every
// timezone (CI runs UTC, dev machines run Europe/Paris).
// Caveat: the subclass is not callable without `new` — bare `Date()` would throw.
// The codebase only uses `new Date()` / `Date.now()`.
const RealDate = Date
const PINNED_NOW = new RealDate(2026, 8, 30, 12, 0, 0).getTime()

class FrozenDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(PINNED_NOW)
    else super(...(args as ConstructorParameters<typeof Date>))
  }

  static now() {
    return PINNED_NOW
  }
}

globalThis.Date = FrozenDate as unknown as DateConstructor
