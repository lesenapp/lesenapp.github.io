// Online lookups shared by the desktop app (Electron main process) and the web app.
// German profiles:
//  - English Wiktionary: German entries with English definitions, gender, IPA, synonyms
//  - OpenThesaurus: German synonym groups
//  - Wikipedia (de/en): article summaries
//  - MyMemory: phrase and sentence translation
//  - German Wiktionary: conjugation and declension tables
// English profiles (lang = 'en'):
//  - English Wiktionary: English definitions, base forms, word forms, IPA, synonyms
//  - Free Dictionary API: UK/US pronunciation audio; Datamuse: synonyms and related words
//  - Wikipedia (en/simple), MyMemory English → Turkish
// All of these services allow browser (CORS) requests.
//
// createDictionary({ fetch, cache }) — `fetch` is a fetch-compatible function and
// `cache` is { get(key) -> value | undefined (may be async), set(key, value) }.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') {
      return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    }
    return ENTITIES[e] ?? m;
  });
}

const INFLECTION =
  /\b(singular|plural|nominative|accusative|dative|genitive|inflection|inflected|participle|preterite|past|present|imperative|subjunctive|infinitive|comparative|superlative|person|form|alternative|spelling|obsolete|archaic)\b/i;

// A whole definition line that only names a grammatical form ("first/third-person singular subjunctive I").
const INFLECTION_LINE =
  /^((first|second|third|first\/third)[- ]person|singular|plural|nominative|accusative|dative|genitive|past|present|imperative|subjunctive|participle|gerund|strong|weak|mixed|positive|comparative|superlative)\b[\w\s/,-]*$/i;

const stripHtml =(html) => decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const unique = (list) => [...new Set(list)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every positional argument of templates such as {{syn|de|a|b}}.
function templateArgs(src, names, firstOnly = false, code = 'de') {
  const out = [];
  const re = new RegExp(`\\{\\{(?:${names})\\|${code}\\|([^{}]*)\\}\\}`, 'g');
  for (const m of src.matchAll(re)) {
    const args = m[1].split('|').filter((a) => !a.includes('='));
    for (const a of firstOnly ? args.slice(0, 1) : args) {
      // Drop wiki markup: [[links]] and inline qualifiers such as <q:dated>.
      const v = a.replace(/\[\[|\]\]/g, '').replace(/<[^>]*>/g, '').trim();
      if (/\p{L}/u.test(v) && !v.startsWith('Thesaurus:')) out.push(v);
    }
  }
  return out;
}

function sectionBodies(src, heading) {
  const out = [];
  const re = new RegExp(`^=+\\s*${heading}\\s*=+\\s*$`, 'gm');
  for (const m of src.matchAll(re)) {
    const after = src.slice(m.index + m[0].length);
    const stop = after.search(/^=/m);
    out.push(stop < 0 ? after : after.slice(0, stop));
  }
  return out.join('\n');
}

// Gender and the dictionary-style plural ending ("-e", "-¨er", "-n", "-") from Wiktionary's
// {{de-noun|gender,genitive,plural}} template, following the template's own defaults.
function nounInfo(args, lemma) {
  const parts = args.split('|').map((a) => a.trim());
  const positional = parts.filter((a) => !a.includes('='));
  const named = Object.fromEntries(parts.filter((a) => a.includes('=')).map((a) => a.split('=')));
  const specs = (positional[0] || '').split(',');
  const g = specs[0] || '';
  // Feminine nouns may leave out the (unchanged) genitive: "f,^" means plural "^".
  const spec = g.startsWith('f') && specs.length === 2 ? specs[1] : specs[2];

  if (g === '+') {
    // Adjectival noun: gender comes from m=/f=/n=, plural ends in -n, and dictionaries list
    // it in the weak form after the article (Erwachsener → der Erwachsene).
    const gender = ['m', 'f', 'n'].find((k) => k in named) ?? null;
    const form = (gender === 'm' && /er$/.test(lemma)) || (gender === 'n' && /es$/.test(lemma)) ? lemma.slice(0, -1) : lemma;
    return { gender, plural: gender ? '-n' : null, form };
  }
  if (g.startsWith('p')) return { gender: 'p', plural: null }; // plural-only (die Kosten)
  const gender = g.match(/^[mfn]/)?.[0] ?? named.g?.match(/^[mfn]/)?.[0] ?? null;
  if (!gender) return { gender: null, plural: null };

  const p = spec?.split(':')[0].trim();
  let plural;
  if (p === undefined || p === '') {
    if (gender === 'f') plural = /in$/.test(lemma) ? '-nen' : /(e|el|er)$/.test(lemma) ? '-n' : '-en';
    else plural = /(el|en|er|chen|lein)$/.test(lemma) ? '-' : /nis$/.test(lemma) ? '-se' : '-e';
  } else if (p === '-' || p === '!') plural = null; // no plural
  else if (p.startsWith('^')) plural = `-¨${p.slice(1)}`;
  else if (/^[a-zäöüß]{1,4}$/.test(p)) plural = `-${p}`;
  else if (/^\p{Lu}/u.test(p)) plural = p; // irregular, given in full
  else plural = null;
  return { gender, plural };
}

export function createDictionary({ fetch, cache }) {
  async function getJson(url) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status === 429 && attempt < 3) {
        // Rate limited: wait (Retry-After if given) and try again.
        await sleep(Math.min(5000, Number(res.headers.get('retry-after')) * 1000 || 700 * 2 ** attempt));
        continue;
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
      return res.json();
    }
  }

  const remember = (key, value) => {
    cache.set(key, value);
    return value;
  };

  // ---------- Wiktionary ----------

  async function wiktionaryEntries(title, code = 'de') {
    const data = await getJson(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(title)}`);
    // The "en" list also holds Translingual entries (symbols, codes); only English ones count.
    const sections = code === 'en' ? data?.en?.filter((s) => s.language === 'English') : data?.de;
    if (!sections?.length) return null;
    const lemmas = new Set();
    const entries = sections
      .map((s) => ({
        title,
        pos: s.partOfSpeech,
        defs: (s.definitions || [])
          .filter((d) => d.definition && stripHtml(d.definition))
          .map((d) => {
            const link = d.definition.match(/form-of-definition-link[\s\S]*?<a[^>]*title="([^"#]+)/);
            const formOf = link ? stripHtml(link[1]) : null;
            // "plural of Haus" is an inflection; "agent noun of lehren: teacher" is a word of its own.
            // "inflection of rufen:" lists its forms as separate lines ("singular imperative")
            // without a link; those are inflections of the same verb.
            const inflection = formOf
              ? INFLECTION.test(stripHtml(d.definition).split(/\bof\b/)[0])
              : lemmas.size > 0 && INFLECTION_LINE.test(stripHtml(d.definition));
            if (inflection) lemmas.add(formOf);
            const examples = (d.parsedExamples || [])
              .map((e) => [e.example, e.translation].filter(Boolean).map(stripHtml).join(' — '))
              .filter(Boolean)
              .slice(0, 2);
            return { text: stripHtml(d.definition), formOf, inflection, examples };
          }),
      }))
      .filter((e) => e.defs.length);
    return entries.length ? { title, entries, lemmas: [...lemmas] } : null;
  }

  async function wiktionaryDetails(title) {
    const data = await getJson(
      `https://en.wiktionary.org/w/api.php?action=parse&format=json&formatversion=2&prop=wikitext&redirects=1&origin=*&page=${encodeURIComponent(title)}`
    );
    const text = data?.parse?.wikitext;
    if (!text) return {};
    const start = text.search(/^==German==\s*$/m);
    if (start < 0) return {};
    const rest = text.slice(start).replace(/^==German==\s*$/m, '');
    const end = rest.search(/^==[^=].*==\s*$/m);
    const de = end < 0 ? rest : rest.slice(0, end);

    let gender = null;
    let plural = null;
    let form = null;
    const noun = de.match(/\{\{de-noun\|([^}]*)\}\}/);
    if (noun) ({ gender, plural, form = null } = nounInfo(noun[1], title));
    return {
      gender,
      plural,
      form,
      ipa: de.match(/\{\{IPA\|de\|([^}|]+)/)?.[1] ?? null,
      synonyms: [
        ...templateArgs(de, 'syn|synonyms'),
        ...templateArgs(sectionBodies(de, 'Synonyms'), 'l|link', true),
      ],
      antonyms: [
        ...templateArgs(de, 'ant|antonyms'),
        ...templateArgs(sectionBodies(de, 'Antonyms'), 'l|link', true),
      ],
    };
  }

  async function openThesaurus(word) {
    try {
      const data = await getJson(
        `https://www.openthesaurus.de/synonyme/search?q=${encodeURIComponent(word)}&format=application/json`
      );
      return (data?.synsets || [])
        .map((s) => s.terms.map((t) => t.term).filter((t) => t.toLowerCase() !== word.toLowerCase()))
        .filter((g) => g.length)
        .slice(0, 8);
    } catch {
      return [];
    }
  }

  async function lookup(word, lang = 'de') {
    const query = String(word || '').trim();
    if (!query) return { query, found: false, entries: [] };
    if (lang === 'en') return lookupEnglish(query.replace(/’/g, "'"));
    const key = `lk4:${query}`; // bumped whenever the result shape changes
    const cached = await cache.get(key);
    if (cached) return cached;

    try {
      // Exact spelling first; then lower case (sentence-initial words) and capitalised (nouns).
      const lower = query.toLowerCase();
      const capital = lower.charAt(0).toUpperCase() + lower.slice(1);
      const found = [];
      for (const variant of unique([query, lower, capital])) {
        const entry = await wiktionaryEntries(variant);
        if (entry) {
          found.push(entry);
          break;
        }
      }

      const titles = found.map((f) => f.title);
      const lemmaTitles = unique(found.flatMap((f) => f.lemmas)).filter((t) => !titles.includes(t)).slice(0, 2);
      const lemmaFound = (await Promise.all(lemmaTitles.map(wiktionaryEntries))).filter(Boolean);

      const entries = [
        ...found.flatMap((f) => f.entries),
        ...lemmaFound.flatMap((f) => f.entries.map((e) => ({ ...e, lemmaOf: query }))),
      ];
      const hasOwnMeaning = found.some((f) => f.entries.some((e) => e.defs.some((d) => !d.inflection)));
      // A word with a meaning of its own is its own base form (Lehrer, not "lehren").
      const lemma = (hasOwnMeaning ? titles[0] : lemmaFound[0]?.title ?? lemmaTitles[0]) ?? titles[0] ?? null;

      const detailTitles = unique([...titles, ...lemmaFound.map((f) => f.title)]).slice(0, 2);
      const [details, thesaurus] = await Promise.all([
        // A failed details request fails the lookup (not cached, retried later) rather than
        // saving the word without its gender.
        Promise.all(detailTitles.map((t) => wiktionaryDetails(t))),
        openThesaurus(lemma || query),
      ]);

      const noun = details.find((d) => d.gender);
      return remember(key, {
        query,
        found: entries.length > 0,
        lemma: noun?.form || lemma,
        entries,
        gender: noun?.gender ?? null,
        plural: noun?.plural ?? null,
        ipa: details.find((d) => d.ipa)?.ipa ?? null,
        synonyms: unique(details.flatMap((d) => d.synonyms || [])).slice(0, 30),
        antonyms: unique(details.flatMap((d) => d.antonyms || [])).slice(0, 20),
        thesaurus,
      });
    } catch (e) {
      return { query, found: false, entries: [], error: e.message };
    }
  }

  // ---------- Wikipedia ----------

  async function wikipedia(query, lang = 'de') {
    if (!['de', 'en', 'simple'].includes(lang)) lang = 'de';
    const key = `wp:${lang}:${query}`;
    const cached = await cache.get(key);
    if (cached) return cached;
    try {
      const search = await getJson(
        `https://${lang}.wikipedia.org/w/api.php?action=opensearch&format=json&limit=6&namespace=0&origin=*&search=${encodeURIComponent(query)}`
      );
      const titles = search?.[1] || [];
      if (!titles.length) return remember(key, { found: false });
      const s = await getJson(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titles[0].replace(/ /g, '_'))}`
      );
      return remember(key, {
        found: Boolean(s),
        title: s?.title ?? titles[0],
        description: s?.description ?? null,
        extract: s?.extract ?? null,
        url: s?.content_urls?.desktop?.page ?? null,
        thumbnail: s?.thumbnail?.source ?? null,
        alternatives: titles.slice(1),
      });
    } catch (e) {
      return { found: false, error: e.message };
    }
  }

  // ---------- Inflection (German Wiktionary) ----------

  // The "Übersicht" table of a German Wiktionary entry: conjugation for verbs, the four cases
  // for nouns, comparison for adjectives. { kind: 'Verb' | 'Substantiv' | 'Adjektiv', forms }.
  async function inflection(word, lang = 'de') {
    const title = String(word || '').trim();
    if (!title) return { kind: null };
    if (lang === 'en') return inflectionEnglish(title);
    const key = `inf1:${title}`;
    const cached = await cache.get(key);
    if (cached) return cached;
    try {
      const data = await getJson(
        `https://de.wiktionary.org/w/api.php?action=parse&format=json&formatversion=2&prop=wikitext&redirects=1&origin=*&page=${encodeURIComponent(title)}`
      );
      const text = data?.parse?.wikitext ?? '';
      const m = text.match(/\{\{Deutsch (Verb|Substantiv|Adjektiv) Übersicht\s*\n([\s\S]*?)\n\}\}/);
      if (!m) return remember(key, { kind: null });
      const forms = {};
      for (const line of m[2].split('\n')) {
        const p = line.match(/^\|\s*([^=]+?)\s*=(.*)$/);
        if (!p || p[1] in forms || /^Bild/.test(p[1])) continue;
        const value = p[2].replace(/<[^>]*>|\[\[|\]\]|'''?/g, '').trim();
        if (value && value !== '—') forms[p[1]] = value;
      }
      return remember(key, { kind: m[1], forms });
    } catch (e) {
      return { kind: null, error: e.message };
    }
  }

  // ---------- Phrase translation ----------

  // MyMemory: free, no key. German → English; English → Turkish.
  async function translate(text, lang = 'de') {
    const q = String(text || '').trim().slice(0, 500);
    if (!q) return { text: '' };
    try {
      const key = lang === 'en' ? `tren:${q}` : `tr:${q}`;
      const cached = await cache.get(key);
      if (cached) return cached;
      const pair = lang === 'en' ? 'en%7Ctr' : 'de%7Cen';
      const data = await getJson(`https://api.mymemory.translated.net/get?langpair=${pair}&q=${encodeURIComponent(q)}`);
      return remember(key, { text: decode(data?.responseData?.translatedText || ''), provider: 'MyMemory' });
    } catch (e) {
      return { error: e.message };
    }
  }

  // ======================================================================================
  // English profiles: English Wiktionary for definitions, base forms and word forms; the
  // Free Dictionary API for UK/US pronunciation audio; Datamuse for synonyms.
  // ======================================================================================

  // "well#Adjective" → "well"
  const cleanLink = (w) => w.replace(/#.*$/, '').trim();

  // English section of a page's wikitext.
  function englishSection(text) {
    const start = text.search(/^==English==\s*$/m);
    if (start < 0) return '';
    const rest = text.slice(start).replace(/^==English==\s*$/m, '');
    const end = rest.search(/^==[^=].*==\s*$/m);
    return end < 0 ? rest : rest.slice(0, end);
  }

  // Page wikitext, fetched once per page for both the details and the word forms.
  const wikitextMemo = new Map();
  async function wikitext(title) {
    if (!wikitextMemo.has(title)) {
      const url = `https://en.wiktionary.org/w/api.php?action=parse&format=json&formatversion=2&prop=wikitext&redirects=1&origin=*&page=${encodeURIComponent(title)}`;
      wikitextMemo.set(
        title,
        getJson(url).then((d) => d?.parse?.wikitext ?? '')
      );
    }
    try {
      return await wikitextMemo.get(title);
    } catch (e) {
      wikitextMemo.delete(title);
      throw e;
    }
  }

  async function englishDetails(title) {
    const en = englishSection(await wikitext(title));
    if (!en) return {};
    return {
      ipa: en.match(/\{\{IPA\|en\|([^}|]+)/)?.[1] ?? null,
      synonyms: [
        ...templateArgs(en, 'syn|synonyms', false, 'en'),
        ...templateArgs(sectionBodies(en, 'Synonyms'), 'l|link', true, 'en'),
      ],
      antonyms: [
        ...templateArgs(en, 'ant|antonyms', false, 'en'),
        ...templateArgs(sectionBodies(en, 'Antonyms'), 'l|link', true, 'en'),
      ],
    };
  }

  // UK and US pronunciation (IPA and a recording) from the Free Dictionary API.
  async function pronunciation(word) {
    try {
      const data = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      const phonetics = (Array.isArray(data) ? data : []).flatMap((e) => e.phonetics || []);
      const pick = (re) => {
        const p = phonetics.find((x) => re.test(x.audio || ''));
        return p ? { ipa: p.text || null, audio: p.audio } : null;
      };
      return { uk: pick(/-uk\.mp3$/), us: pick(/-us\.mp3$/), ipa: phonetics.find((x) => x.text)?.text ?? null };
    } catch {
      return { uk: null, us: null, ipa: null };
    }
  }

  // Synonyms, antonyms and words of similar meaning from Datamuse (WordNet based).
  async function datamuse(word) {
    const get = async (rel) => {
      try {
        const list = await getJson(`https://api.datamuse.com/words?${rel}=${encodeURIComponent(word)}&max=24`);
        return (list || []).map((w) => w.word).filter((w) => w.toLowerCase() !== word.toLowerCase());
      } catch {
        return [];
      }
    };
    const [synonyms, antonyms, similar] = await Promise.all([get('rel_syn'), get('rel_ant'), get('ml')]);
    return { synonyms, antonyms, similar: similar.filter((w) => !synonyms.includes(w)).slice(0, 20) };
  }

  async function lookupEnglish(query) {
    const key = `lken1:${query}`;
    const cached = await cache.get(key);
    if (cached) return cached;
    try {
      // Exact spelling, lower case (sentence-initial words), then without a possessive 's.
      const lower = query.toLowerCase();
      const bare = query.replace(/'s$/i, '').replace(/s'$/i, 's');
      const found = [];
      for (const variant of unique([query, lower, bare, bare.toLowerCase()]).filter(Boolean)) {
        const entry = await wiktionaryEntries(variant, 'en');
        if (entry) {
          found.push(entry);
          break;
        }
      }

      const titles = found.map((f) => f.title);
      const lemmaTitles = unique(found.flatMap((f) => f.lemmas)).filter((t) => !titles.includes(t)).slice(0, 2);
      const lemmaFound = (await Promise.all(lemmaTitles.map((t) => wiktionaryEntries(t, 'en')))).filter(Boolean);

      // English words often have a rare meaning of their own besides being a form of another
      // word ("ran": simple past of run, and a kind of yarn). The first sense decides: when it
      // is a form of another word, that word is the base form, and its meanings come right
      // after the "simple past of run" line, before the rare ones.
      const own = found.flatMap((f) => f.entries);
      const firstIsForm = Boolean(own[0]?.defs[0]?.inflection);
      const lemma = (firstIsForm ? own[0].defs[0].formOf ?? lemmaFound[0]?.title : titles[0]) ?? titles[0] ?? null;
      const forms = own.filter((e) => e.defs.every((d) => d.inflection));
      const lemmaEntries = lemmaFound
        .sort((a, b) => (b.title === lemma) - (a.title === lemma))
        .flatMap((f) => f.entries.map((e) => ({ ...e, lemmaOf: query })));
      const entries = firstIsForm
        ? [...forms, ...lemmaEntries, ...own.filter((e) => !forms.includes(e))]
        : [...own, ...lemmaEntries];

      const detailTitles = unique([...titles, ...lemmaFound.map((f) => f.title)]).slice(0, 2);
      const [details, related, voice] = await Promise.all([
        Promise.all(detailTitles.map((t) => englishDetails(t))),
        datamuse(lemma || query),
        // Pronounced as written in the text ("ran", not "run").
        pronunciation(titles[0] || query),
      ]);

      return remember(key, {
        query,
        found: entries.length > 0,
        lemma,
        entries,
        gender: null,
        plural: null,
        ipa: voice.uk?.ipa || voice.us?.ipa || voice.ipa || details.find((d) => d.ipa)?.ipa || null,
        audio: { uk: voice.uk, us: voice.us },
        // Datamuse (WordNet) first: its synonyms are the everyday ones.
        synonyms: unique([...related.synonyms, ...details.flatMap((d) => d.synonyms || [])].map(cleanLink)).slice(0, 30),
        antonyms: unique([...related.antonyms, ...details.flatMap((d) => d.antonyms || [])].map(cleanLink)).slice(0, 20),
        thesaurus: related.similar.length ? [related.similar] : [],
      });
    } catch (e) {
      return { query, found: false, entries: [], error: e.message };
    }
  }

  // Word forms from the headword lines of the English entry (runs, running, ran, run;
  // children; better, best), rendered by Wiktionary itself so irregular forms are exact.
  // { kind: 'en', heads: [{ pos: 'verb' | 'noun' | 'adj' | 'adv', forms: [[label, form]], notes }] }
  async function inflectionEnglish(title) {
    const key = `infen1:${title}`;
    const cached = await cache.get(key);
    if (cached) return cached;
    try {
      const en = englishSection(await wikitext(title));
      const templates = [];
      for (const m of en.matchAll(/\{\{en-(verb|noun|adj|adv)(\|[^{}]*)?\}\}/g)) {
        if (!templates.some((t) => t.pos === m[1])) templates.push({ pos: m[1], text: m[0] });
      }
      if (!templates.length) return remember(key, { kind: null });
      const source = templates.map((t) => t.text).join('\n@@@\n');
      const data = await getJson(
        `https://en.wiktionary.org/w/api.php?action=expandtemplates&format=json&formatversion=2&prop=wikitext&origin=*&title=${encodeURIComponent(title)}&text=${encodeURIComponent(source)}`
      );
      const parts = (data?.expandtemplates?.wikitext ?? '').split('@@@');
      const formRe = /<i>(?:\[\[[^\]|]*\|)?([^<\]]+?)(?:\]\])?<\/i>\s*<b[^>]*>(?:\[\[:?[^\]|]*\|)?([^\]<]+)(?:\]\])?<\/b>/g;
      const heads = templates
        .map((t, i) => {
          const html = (parts[i] ?? '').replace(/\[\[Category:[^\]]*\]\]/g, '');
          const forms = [];
          for (const m of html.matchAll(formRe)) {
            const label = stripHtml(m[1]);
            // "more [[:quickly#English|quickly" → "more quickly"
            const form = stripHtml(m[2]).replace(/\[\[:?(?:[^\]|]*\|)?/g, '').replace(/\]\]/g, '');
            // "or" introduces another accepted form of the previous one.
            if (label === 'or') {
              if (forms.length) forms[forms.length - 1][1] += ` / ${form}`;
            } else forms.push([label, form]);
          }
          const text = stripHtml(html.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1'));
          const note = ['countable and uncountable', 'uncountable', 'not comparable', 'plural only'].find((n) =>
            text.includes(n)
          );
          return { pos: t.pos, forms, notes: note ? [note] : [] };
        })
        .filter((h) => h.forms.length || h.notes.length);
      return remember(key, heads.length ? { kind: 'en', heads } : { kind: null });
    } catch (e) {
      return { kind: null, error: e.message };
    }
  }

  return { lookup, wikipedia, translate, inflection };
}
