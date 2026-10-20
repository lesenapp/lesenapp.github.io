// Word status, LingQ-style: absent = new (blue), 1–4 = learning (yellow, fading),
// 5 = known (no highlight), -1 = ignored (names, foreign words, …).
export const NEW = 0;
export const KNOWN = 5;
export const IGNORED = -1;

export const STATUS_LABELS = { 0: 'New', 1: 'Level 1', 2: 'Level 2', 3: 'Level 3', 4: 'Level 4', 5: 'Known', [-1]: 'Ignored' };

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

export const ARTICLES = { m: 'der', f: 'die', n: 'das' };

// Wiktionary inflection lines ("nominative plural of Haus") that slipped past form-of detection.
const GRAMMAR_NOTE =
  /\b(singular|plural|nominative|accusative|dative|genitive|inflection|participle|preterite|imperative|comparative|superlative|person)\b.*\bof\b/i;

// First short English gloss from a lookup, preferring a real meaning over grammar notes.
export function firstGloss(data) {
  if (!data?.entries?.length) return '';
  const defs = data.entries.flatMap((e) => e.defs);
  const def = defs.find((d) => !d.formOf && !GRAMMAR_NOTE.test(d.text)) || defs[0];
  return def ? def.text.split(/;\s/)[0].slice(0, 90) : '';
}

// The article for nouns, taken from the dictionary form (lemma).
export function articleOf(w) {
  return w.gender && w.lemma && /^\p{Lu}/u.test(w.lemma) ? ARTICLES[w.gender] : null;
}

// How a saved word is shown and sent to Anki: nouns as "das Haus", other words as saved.
export function headword(w) {
  const article = articleOf(w);
  return article ? `${article} ${w.lemma}` : w.word;
}
