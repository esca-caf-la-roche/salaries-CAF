export function independentSeasonBounds(schoolYear: number) {
  // September 1 is in summer time in Europe/Paris for the supported school years.
  return {
    startsAt: new Date(`${schoolYear}-09-01T00:00:00+02:00`).toISOString(),
    endsAt: new Date(`${schoolYear + 1}-09-01T00:00:00+02:00`).toISOString(),
  };
}

export function clipIndependentEvent(startsAt: string, endsAt: string, bounds: { startsAt: string; endsAt: string }) {
  const start = Math.max(Date.parse(startsAt), Date.parse(bounds.startsAt));
  const end = Math.min(Date.parse(endsAt), Date.parse(bounds.endsAt));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() };
}
