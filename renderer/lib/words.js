// Saved words: the ones you looked up or saved while reading. Learning progress lives in Anki,
// so a word here is simply saved (with its meaning) or not.

export function upsert(words, key, patch) {
  const prev = words[key];
  const now = Date.now();
  return { ...words, [key]: { key, created: now, ...prev, ...patch, updated: now } };
}

export function remove(words, key) {
  const next = { ...words };
  delete next[key];
  return next;
}

// Older versions stored "known" (5) and "ignored" (-1) words; those were never saved words.
export const isLegacyUnsaved = (w) => w.status === 5 || w.status === -1;

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
