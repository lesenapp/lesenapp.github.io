// Word status, LingQ-style: absent = new (blue), 1–4 = learning (yellow, fading),
// 5 = known (no highlight), -1 = ignored (names, foreign words, …).
export const NEW = 0;
export const KNOWN = 5;
export const IGNORED = -1;

export const STATUS_LABELS = { 0: 'New', 1: '1', 2: '2', 3: '3', 4: '4', 5: 'Known', [-1]: 'Ignored' };

export const statusOf = (words, key) => words[key]?.status ?? NEW;

export const isLearning = (w) => w.status >= 1 && w.status <= 4;

export function upsert(words, key, patch) {
  const prev = words[key];
  const now = Date.now();
  return {
    ...words,
    [key]: { key, status: 1, created: now, ...prev, ...patch, updated: now },
  };
}

export function remove(words, key) {
  const next = { ...words };
  delete next[key];
  return next;
}

// First short English gloss from a lookup, preferring the base form's own meaning.
export function firstGloss(data) {
  if (!data?.entries?.length) return '';
  const own = data.entries.flatMap((e) => e.defs).find((d) => !d.formOf);
  const def = own || data.entries[0].defs[0];
  return def ? def.text.split(/;\s/)[0].slice(0, 90) : '';
}

export const ARTICLES = { m: 'der', f: 'die', n: 'das' };
