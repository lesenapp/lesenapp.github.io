// Reading stats per profile: { days: { '2026-10-27': words }, seen: { '<day>|<text>:<page>': 1 } }.
// A page counts once per day, after it has been open for a while (see Reader).

export const today = () => new Date().toLocaleDateString('sv'); // local YYYY-MM-DD

export function recordReading(stats, pageKey, count) {
  const day = today();
  const seenKey = `${day}|${pageKey}`;
  if (stats.seen?.[seenKey]) return stats;
  // Only today's "seen" entries are needed; older ones are dropped.
  const seen = Object.fromEntries(Object.entries(stats.seen ?? {}).filter(([k]) => k.startsWith(day)));
  return {
    days: { ...stats.days, [day]: (stats.days?.[day] ?? 0) + count },
    seen: { ...seen, [seenKey]: 1 },
  };
}

export function readingSummary(stats) {
  const days = stats.days ?? {};
  const d = new Date();
  // The streak still counts when today has no reading yet.
  if (!days[today()]) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (days[d.toLocaleDateString('sv')]) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return { today: days[today()] ?? 0, streak };
}
