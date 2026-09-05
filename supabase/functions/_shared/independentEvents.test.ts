import { describe, expect, it } from 'vitest';
import { clipIndependentEvent, independentSeasonBounds } from './independentEvents';

describe('independent events school year', () => {
  const bounds = independentSeasonBounds(2026);
  it('uses midnight Paris for the September to August season', () => {
    expect(bounds).toEqual({ startsAt: '2026-08-31T22:00:00.000Z', endsAt: '2027-08-31T22:00:00.000Z' });
  });
  it('clips hours crossing the first or last day of the season', () => {
    expect(clipIndependentEvent('2026-08-31T21:00:00Z', '2026-09-01T01:00:00Z', bounds)).toEqual({ startsAt: bounds.startsAt, endsAt: '2026-09-01T01:00:00.000Z' });
    expect(clipIndependentEvent('2027-08-31T21:00:00Z', '2027-09-01T01:00:00Z', bounds)).toEqual({ startsAt: '2027-08-31T21:00:00.000Z', endsAt: bounds.endsAt });
  });
  it('preserves real elapsed times across daylight saving', () => {
    const event = clipIndependentEvent('2026-10-25T01:00:00+02:00', '2026-10-25T04:00:00+01:00', bounds)!;
    expect((Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 3600000).toBe(4);
  });
  it('excludes outside, empty, reversed and invalid intervals', () => {
    expect(clipIndependentEvent('2026-08-31T21:00:00Z', bounds.startsAt, bounds)).toBeNull();
    expect(clipIndependentEvent(bounds.endsAt, '2027-09-01T01:00:00Z', bounds)).toBeNull();
    expect(clipIndependentEvent(bounds.startsAt, bounds.startsAt, bounds)).toBeNull();
    expect(clipIndependentEvent(bounds.endsAt, bounds.startsAt, bounds)).toBeNull();
    expect(clipIndependentEvent('invalid', bounds.endsAt, bounds)).toBeNull();
  });
});
