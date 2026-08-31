import { describe, expect, it } from 'vitest'
import { formatHours, monthLabel } from './format'

describe('format helpers', () => {
  it('formats French month labels', () => expect(monthLabel(2)).toBe('Fév'))
  it('formats weighted hours', () => expect(formatHours(12.5)).toContain('12,5'))
})
