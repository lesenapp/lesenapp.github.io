// Online lookups shared by the desktop app (Electron main process) and the web app.
//  - English Wiktionary: German entries with English definitions, gender, IPA, synonyms
//  - OpenThesaurus: German synonym groups
//  - Wikipedia (de/en): article summaries
//  - Google Cloud Translation / DeepL (optional keys) or MyMemory: phrase translation
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

const stripHtml = (html) => decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const unique = (list) => [...new Set(list)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every positional argument of templates such as {{syn|de|a|b}}.
function templateArgs(src, names, firstOnly = false) {
  const out = [];
  const re = new RegExp(`\\{\\{(?:${names})\\|de\\|([^{}]*)\\}\\}`, 'g');
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

  async function wiktionaryEntries(title) {
    const data = await getJson(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(title)}`);
    const sections = data?.de;
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
            if (formOf) lemmas.add(formOf);
            const examples = (d.parsedExamples || [])
              .map((e) => [e.example, e.translation].filter(Boolean).map(stripHtml).join(' — '))
              .filter(Boolean)
              .slice(0, 2);
            return { text: stripHtml(d.definition), formOf, examples };
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
    const noun = de.match(/\{\{de-noun\|([^}]*)\}\}/);
    if (noun) {
      const args = noun[1].split('|');
      const named = args.find((a) => /^g=/.test(a.trim()));
      const first = args.find((a) => !a.includes('=')) || '';
      gender = (named ? named.trim().slice(2) : first.trim()).match(/^[mfn]/)?.[0] ?? null;
    }
    return {
      gender,
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

  async function lookup(word) {
    const query = String(word || '').trim();
    if (!query) return { query, found: false, entries: [] };
    const key = `lk:${query}`;
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
      const hasOwnMeaning = found.some((f) => f.entries.some((e) => e.defs.some((d) => !d.formOf)));
      const lemma = lemmaFound[0]?.title ?? (hasOwnMeaning ? titles[0] : lemmaTitles[0]) ?? titles[0] ?? null;

      const detailTitles = unique([...titles, ...lemmaFound.map((f) => f.title)]).slice(0, 2);
      const [details, thesaurus] = await Promise.all([
        Promise.all(detailTitles.map((t) => wiktionaryDetails(t).catch(() => ({})))),
        openThesaurus(lemma || query),
      ]);

      return remember(key, {
        query,
        found: entries.length > 0,
        lemma,
        entries,
        gender: details.find((d) => d.gender)?.gender ?? null,
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
    if (!['de', 'en'].includes(lang)) lang = 'de';
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

  // ---------- Phrase translation ----------

  // Provider order: Google Cloud Translation (if key), DeepL (if key), MyMemory (free, no key).
  async function translate(text, keys = {}) {
    const q = String(text || '').trim().slice(0, 500);
    if (!q) return { text: '' };
    const { googleKey, deeplKey } = keys || {};
    try {
      if (googleKey) {
        const key = `gt:${q}`;
        const cached = await cache.get(key);
        if (cached) return cached;
        const res = await fetch(
          `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(googleKey.trim())}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q, source: 'de', target: 'en', format: 'text' }),
          }
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(`Google Translate: ${data?.error?.message || `HTTP ${res.status}`}`);
        return remember(key, { text: decode(data.data.translations[0].translatedText), provider: 'Google Translate' });
      }
      if (deeplKey) {
        const host = deeplKey.trim().endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
        const res = await fetch(`https://${host}/v2/translate`, {
          method: 'POST',
          headers: { Authorization: `DeepL-Auth-Key ${deeplKey.trim()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: [q], source_lang: 'DE', target_lang: 'EN-US' }),
        });
        if (!res.ok) throw new Error(`DeepL returned HTTP ${res.status}`);
        const data = await res.json();
        return { text: data.translations[0].text, provider: 'DeepL' };
      }
      const key = `tr:${q}`;
      const cached = await cache.get(key);
      if (cached) return cached;
      const data = await getJson(`https://api.mymemory.translated.net/get?langpair=de%7Cen&q=${encodeURIComponent(q)}`);
      return remember(key, { text: decode(data?.responseData?.translatedText || ''), provider: 'MyMemory' });
    } catch (e) {
      return { error: e.message };
    }
  }

  return { lookup, wikipedia, translate };
}
