import { describe, expect, it } from 'vitest'
import { AUTOMATIC_SYNC_FRESHNESS_MS, wasSyncedRecently } from './syncPolicy'

describe('automatic calendar synchronization policy', () => {
  const now = Date.parse('2026-09-24T10:00:00.000Z')

  it('skips a resource synchronized less than one hour ago', () => {
    expect(wasSyncedRecently(new Date(now - AUTOMATIC_SYNC_FRESHNESS_MS + 1).toISOString(), now)).toBe(true)
  })

  it('synchronizes a resource once it is one hour old', () => {
    expect(wasSyncedRecently(new Date(now - AUTOMATIC_SYNC_FRESHNESS_MS).toISOString(), now)).toBe(false)
  })

  it('synchronizes resources with no valid previous date', () => {
    expect(wasSyncedRecently(null, now)).toBe(false)
    expect(wasSyncedRecently('invalid', now)).toBe(false)
  })
})
