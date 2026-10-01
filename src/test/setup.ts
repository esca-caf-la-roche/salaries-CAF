import '@testing-library/jest-dom/vitest'

// Freeze "today" so date-dependent views (default month, J-7 windows, previous-month
// validation) render the same state on every run. 2026-09-30 is a date the full suite
// was verified green on; without this, tests break whenever the real month changes.
const RealDate = Date
const PINNED_NOW = new RealDate('2026-09-30T12:00:00+02:00').getTime()

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
