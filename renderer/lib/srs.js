// SM-2 style scheduling (same family Readlang uses: ease factor starting at 2.5).
const DAY = 24 * 60 * 60 * 1000;
const RELEARN_DELAY = 10 * 60 * 1000;

export const GRADES = [
  { id: 'again', label: 'Again', q: 1, key: '1' },
  { id: 'hard', label: 'Hard', q: 3, key: '2' },
  { id: 'good', label: 'Good', q: 4, key: '3' },
  { id: 'easy', label: 'Easy', q: 5, key: '4' },
];

export function schedule(srs, q, now = Date.now()) {
  let { ef = 2.5, interval = 0, reps = 0 } = srs || {};
  if (q < 3) {
    reps = 0;
    interval = 0;
  } else {
    reps += 1;
    if (reps === 1) interval = q === 5 ? 3 : 1;
    else if (reps === 2) interval = q === 3 ? 2 : q === 5 ? 6 : 4;
    else interval = Math.max(interval + 1, Math.round(interval * ef * (q === 3 ? 0.6 : q === 5 ? 1.3 : 1)));
  }
  ef = Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  const due = q < 3 ? now + RELEARN_DELAY : now + interval * DAY;
  return { ef: Math.round(ef * 100) / 100, interval, reps, due, last: now };
}

export function describeDelay(srs, q) {
  const next = schedule(srs, q);
  if (next.interval === 0) return '10 min';
  return next.interval === 1 ? '1 day' : `${next.interval} days`;
}

export const isDue = (w, now = Date.now()) => (w.srs?.due ?? 0) <= now;

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
