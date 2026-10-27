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

export const ARTICLES = { m: 'der', f: 'die', n: 'das', p: 'die' };

// Bump when saved words need another dictionary pass (2: plural endings, 3: base forms,
// 4: base forms of verb forms such as "rufe", separable verbs).
export const LOOKUP_VERSION = 4;

// What a word is saved with after a dictionary lookup.
export const lookupFields = (data) => ({
  lemma: data.lemma,
  gender: data.gender,
  plural: data.plural ?? null,
  particle: data.separable?.particle ?? null,
  looked: LOOKUP_VERSION,
});

// Dictionary lookup of a word as it appears in a text. With the particle that closes its
// clause ("rufe … an") it becomes the separable verb ("anrufen") when that verb exists.
export async function lookupWord(text, particle) {
  const d = await window.api.lookup(text);
  if (!particle || !d?.found) return d;
  const bases = [d.lemma, ...d.entries.flatMap((e) => e.defs).filter((x) => x.inflection).map((x) => x.formOf)];
  for (const base of [...new Set(bases)].filter((b) => b && /^\p{Ll}/u.test(b)).slice(0, 2)) {
    const verb = await window.api.lookup(particle + base);
    if (verb?.found && verb.entries.some((e) => e.pos === 'Verb')) {
      return { ...verb, lemma: verb.lemma || particle + base, separable: { particle } };
    }
  }
  return d;
}

// Wiktionary inflection lines ("nominative plural of Haus") that slipped past form-of detection.
const GRAMMAR_NOTE =
  /\b(singular|plural|nominative|accusative|dative|genitive|inflection|participle|preterite|imperative|comparative|superlative|person)\b.*\bof\b/i;

// "agent noun of lehren: one who teaches, teacher" → "one who teaches, teacher";
// "female equivalent of Lehrer (“teacher”)" → "female teacher".
function cleanGloss(text) {
  const afterColon = text.match(/^[^:]*\bof\b[^:]*:\s*(.+)$/);
  if (afterColon) return afterColon[1];
  const quoted = text.match(/^(female equivalent|feminine|diminutive)\b.*?[“"]([^”"]+)[”"]/i);
  if (quoted) return `${/^dim/i.test(quoted[1]) ? 'little' : 'female'} ${quoted[2]}`;
  return text;
}

// First short English gloss from a lookup, preferring a real meaning over grammar notes.
export function firstGloss(data) {
  if (!data?.entries?.length) return '';
  const defs = data.entries.flatMap((e) => e.defs);
  const def = defs.find((d) => !d.inflection && !GRAMMAR_NOTE.test(d.text)) || defs[0];
  return def ? cleanGloss(def.text).split(/;\s/)[0].slice(0, 90) : '';
}

// The article for nouns, taken from the dictionary form (lemma).
export function articleOf(w) {
  return w.gender && w.lemma && /^\p{Lu}/u.test(w.lemma) ? ARTICLES[w.gender] : null;
}

// Dictionary form, as on the Anki cards: "das Haus, -¨er", "zweifeln"; phrases as saved.
export function headword(w) {
  if (w.isPhrase || !w.lemma) return w.word;
  const article = articleOf(w);
  if (!article) return w.lemma;
  return `${article} ${w.lemma}${w.plural ? `, ${w.plural}` : ''}`;
}
