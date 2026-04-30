export const ONE_HOUR = 60 * 60 * 1000;

export function isStale(updatedAt, now) {
  return Number(updatedAt) + ONE_HOUR < now;
}

export function needsRefresh(cached, now) {
  if (cached.length === 0) return true;
  return cached.some(r => isStale(r.updatedAt, now));
}
