export const AUTOMATIC_SYNC_FRESHNESS_MS = 60 * 60 * 1000;

export function wasSyncedRecently(lastSyncedAt: unknown, now = Date.now()): boolean {
  if (typeof lastSyncedAt !== "string") return false;
  const timestamp = Date.parse(lastSyncedAt);
  return Number.isFinite(timestamp) && now - timestamp >= 0 && now - timestamp < AUTOMATIC_SYNC_FRESHNESS_MS;
}
