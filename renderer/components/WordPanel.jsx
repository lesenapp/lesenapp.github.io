import { useEffect, useRef, useState } from 'react';
import { LOOKUP_VERSION, articleOf, firstGloss, lookupFields, lookupWord } from '../lib/words.js';
import { prepositionCase } from '../lib/grammar.js';
import { playAudio, speak } from '../lib/speech.js';
import { languageOf } from '../lib/language.js';

export default function WordPanel({ sel, lang = 'de', record, settings, onPatch, onNavigate, onClose }) {
  const language = languageOf(lang);
  const [data, setData] = useState(null);
  const [tab, setTabState] = useState('dict');
  const isWord = sel.kind === 'word';
  const panelRef = useRef();
  const tabsRef = useRef();

  // A new tab starts at its top: if the panel was scrolled past the (pinned) tab bar, scroll
  // back to where the tab bar sits in the panel.
  const setTab = (id) => {
    setTabState(id);
    const panel = panelRef.current;
    const anchor = tabsRef.current?.previousElementSibling;
    if (!panel || !anchor) return;
    const below = anchor.getBoundingClientRect().bottom - panel.getBoundingClientRect().top;
    if (below < 0) panel.scrollTop += below;
  };

  useEffect(() => {
    let alive = true;
    const request = isWord
      ? lookupWord(sel.text, sel.particle, lang, sel.weak)
      : window.api.translate(sel.text, lang);
    request.then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [isWord, sel.text, sel.particle, sel.weak, lang]);

  // What a word is saved with: its first meaning plus base form and gender (for the article).
  const saveFields = () =>
    isWord
      ? data?.found
        ? { translation: firstGloss(data), ...lookupFields(data) }
        : {}
      : { translation: data?.text || '' };

  // Readlang-style: looking a word up in a text saves it. A word that is already saved gets
  // its missing meaning, base form and gender filled in.
  useEffect(() => {
    if (!data || data.error) return;
    if (!isWord) {
      if (record && !record.translation?.trim() && data.text) onPatch({ translation: data.text });
      return;
    }
    if (!data.found) return;
    if (!record) {
      if (settings.autoSave && sel.context) onPatch(saveFields());
      return;
    }
    const separableChanged = Boolean(data.separable) && record.lemma !== data.lemma;
    if (!record.translation?.trim() || record.looked !== LOOKUP_VERSION || separableChanged) {
      const keepMeaning = record.translation?.trim() && !separableChanged;
      onPatch({ ...lookupFields(data), ...(keepMeaning ? {} : { translation: firstGloss(data) }) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const term = isWord ? data?.lemma || sel.text : sel.text;
  const caseHint = isWord && lang === 'de' ? prepositionCase(sel.text) : null;
  const article = isWord && data ? articleOf(data) : null;
  const isBaseForm = !data?.lemma || data.lemma.toLowerCase() === sel.text.toLowerCase();

  return (
    <aside className="panel" ref={panelRef}>
      <div className="panel-head">
        <div className="panel-word">
          {article && isBaseForm && <span className={`article g-${data.gender}`}>{article}</span>}
          <span className="word">{sel.text}</span>
          {data?.separable && <span className="word particle"> … {data.separable.particle}</span>}
          {article && isBaseForm && data.plural && <span className="plural muted">, {data.plural}</span>}
        </div>
        <div className="row tight">
          <button
            className="icon-btn gt-icon-btn"
            title="Google Translate"
            onClick={() => setTab(isWord ? 'google' : 'dict')}
          >
            G
          </button>
          <button className="icon-btn" title="Listen" onClick={() => speak(sel.text, 0.9, language.speech(settings))}>
            🔊
          </button>
          <button
            className={`icon-btn star ${record?.favorite ? 'on' : ''}`}
            title="Favourite (F)"
            onClick={() => onPatch({ favorite: !record?.favorite })}
          >
            {record?.favorite ? '★' : '☆'}
          </button>
          <button className="icon-btn" title="Close (Esc)" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      {isWord && !isBaseForm && (
        <div className="lemma">
          {data?.separable ? (lang === 'en' ? 'Phrasal verb:' : 'Separable verb:') : 'Base form:'}{' '}
          {article && <span className={`article g-${data.gender}`}>{article}</span>}{' '}
          <button className="link" onClick={() => onNavigate(data.lemma)}>
            {data.lemma}
          </button>
        </div>
      )}
      {isWord && data?.phrasal && (
        <div className="lemma">
          Phrasal verb:{' '}
          <button className="link" onClick={() => onNavigate(data.phrasal)}>
            {data.phrasal}
          </button>
        </div>
      )}
      {isWord && (data?.ipa || data?.audio?.uk || data?.audio?.us) && (
        <div className="ipa">
          {data.ipa}
          {['uk', 'us'].map(
            (a) =>
              data.audio?.[a] && (
                <button key={a} className="accent-btn" title={`${a.toUpperCase()} pronunciation`} onClick={() => playAudio(data.audio[a].audio)}>
                  🔊 {a.toUpperCase()}
                </button>
              )
          )}
        </div>
      )}
      {caseHint && (
        <div className="lemma">
          Preposition + <b>{caseHint}</b>
        </div>
      )}

      <button
        className={`save-btn ${record ? 'on' : ''}`}
        onClick={() => onPatch(record ? null : saveFields())}
        title={record ? 'Remove from my words' : 'Save to my words (sent to Anki)'}
      >
        {record ? '✓ Saved to my words' : '+ Save to my words'}
      </button>

      <label className="field">
        <span>My meaning</span>
        <input
          className="input"
          value={record?.translation ?? ''}
          placeholder={isWord ? 'Click a definition below or type your own' : 'Translation'}
          onChange={(e) => onPatch({ translation: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Note</span>
        <textarea
          className="input note"
          value={record?.note ?? ''}
          placeholder={`Anything to remember (${lang === 'en' ? 'usage, example' : 'gender, plural, example'}…)`}
          onChange={(e) => onPatch({ note: e.target.value })}
        />
      </label>

      <div className="tabs" ref={tabsRef}>
        {[
          ['dict', isWord ? 'Dictionary' : 'Translation'],
          ['google', 'Google'],
          ['embed', language.embed.label],
          ['syn', 'Synonyms'],
          ['wiki', 'Wikipedia'],
          ['links', 'More'],
        ]
          .filter(([id]) => isWord || (id !== 'syn' && id !== 'google' && id !== 'embed'))
          .map(([id, label]) => (
            <button key={id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
      </div>

      <div className="tab-body">
        {tab === 'dict' &&
          (isWord ? (
            <>
              {data?.found && <Forms word={term} lang={lang} pos={data.entries[0]?.pos} />}
              <Definitions data={data} onPick={(t) => onPatch({ translation: t })} onNavigate={onNavigate} />
            </>
          ) : (
            <PhraseTranslation data={data} text={sel.text} language={language} />
          ))}
        {tab === 'google' && <GoogleTranslate text={sel.text} language={language} />}
        {tab === 'embed' && <Embed word={term} language={language} />}
        {tab === 'syn' && <Synonyms data={data} source={language.synonymsSource} onNavigate={onNavigate} />}
        {tab === 'wiki' && <Wikipedia query={term} wikis={language.wikis} />}
        {tab === 'links' && (
          <ul className="links">
            {language.links.map((l) => (
              <li key={l.name}>
                <button className="link" onClick={() => window.api.openExternal(l.url(term))}>
                  {l.name} ↗
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function Loading() {
  return (
    <div className="skeleton">
      <div />
      <div />
      <div />
    </div>
  );
}

// Conjugation, declension or comparison from German Wiktionary, shown above the meanings.
const DECLENSION = {
  m: ['der', 'des', 'dem', 'den'],
  f: ['die', 'der', 'der', 'die'],
  n: ['das', 'des', 'dem', 'das'],
  p: ['die', 'der', 'den', 'die'],
};
const CASE_NAMES = ['Nominativ', 'Genitiv', 'Dativ', 'Akkusativ'];

// English headword forms: the part of speech of the first meaning decides which line is shown.
const EN_POS = { Verb: 'verb', Noun: 'noun', Adjective: 'adj', Adverb: 'adv' };
const EN_LABELS = {
  'third-person singular simple present': 'he/she/it',
  'present participle': '-ing form',
  'simple past': 'Past',
  'past participle': 'Past participle',
  'simple past and past participle': 'Past / participle',
  plural: 'Plural',
  comparative: 'Comparative',
  superlative: 'Superlative',
};

function Forms({ word, lang, pos }) {
  const [inf, setInf] = useState(null);

  useEffect(() => {
    let alive = true;
    setInf(null);
    window.api.inflection(word, lang).then((d) => alive && setInf(d));
    return () => {
      alive = false;
    };
  }, [word, lang]);

  if (!inf?.kind) return null;

  if (inf.kind === 'en') {
    const head = inf.heads.find((h) => h.pos === EN_POS[pos]) ?? (EN_POS[pos] ? null : inf.heads[0]);
    if (!head) return null;
    if (!head.forms.length) return head.notes.length ? <p className="forms-line muted">{head.notes.join(' · ')}</p> : null;
    return (
      <table className="forms">
        <tbody>
          {head.forms.map(([label, form]) => (
            <tr key={label}>
              <th>{EN_LABELS[label] ?? label[0].toUpperCase() + label.slice(1)}</th>
              <td>{form}</td>
            </tr>
          ))}
          {head.notes.map((n) => (
            <tr key={n}>
              <th />
              <td className="muted">{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const f = inf.forms;

  if (inf.kind === 'Verb') {
    const aux = f.Hilfsverb === 'sein' ? 'ist' : f.Hilfsverb?.includes('sein') ? 'hat/ist' : 'hat';
    const rows = [
      ['ich', f['Präsens_ich']],
      ['du', f['Präsens_du']],
      ['er/sie/es', f['Präsens_er, sie, es']],
      ['Präteritum', f['Präteritum_ich']],
      ['Perfekt', f['Partizip II'] && `${aux} ${f['Partizip II']}`],
      ['Konjunktiv II', f['Konjunktiv II_ich']],
      ['Imperativ', [f['Imperativ Singular'], f['Imperativ Plural']].filter(Boolean).join(' / ')],
    ].filter(([, v]) => v);
    return (
      <table className="forms">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (inf.kind === 'Substantiv') {
    const g = f.Genus?.[0];
    const singular = DECLENSION[g] && f['Nominativ Singular'];
    const plural = f['Nominativ Plural'];
    if (!singular && !plural) return null;
    return (
      <table className="forms">
        <thead>
          <tr>
            <th />
            {singular && <th>Singular</th>}
            {plural && <th>Plural</th>}
          </tr>
        </thead>
        <tbody>
          {CASE_NAMES.map((c, i) => (
            <tr key={c}>
              <th>{c.slice(0, 3)}.</th>
              {singular && (
                <td>
                  <span className="muted">{DECLENSION[g][i]}</span> {f[`${c} Singular`]}
                </td>
              )}
              {plural && (
                <td>
                  <span className="muted">{DECLENSION.p[i]}</span> {f[`${c} Plural`]}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const rows = [f.Positiv, f.Komparativ, f.Superlativ && `am ${f.Superlativ}`].filter(Boolean);
  if (rows.length < 2) return null;
  return <p className="forms-line">{rows.join(' · ')}</p>;
}

function Definitions({ data, onPick, onNavigate }) {
  if (!data) return <Loading />;
  if (data.error) return <p className="error">Could not reach Wiktionary: {data.error}</p>;
  if (!data.found) return <p className="muted">No dictionary entry found. Try the “More” tab.</p>;
  return (
    <div className="defs">
      {data.entries.map((e, i) => (
        <section key={i}>
          <h4>
            {e.pos}
            {e.lemmaOf && <span className="muted"> · {e.title}</span>}
          </h4>
          <ol>
            {e.defs.map((d, j) => (
              <li key={j}>
                <button className="def" onClick={() => onPick(d.text.split(/;\s/)[0])} title="Use as my meaning">
                  {d.text}
                </button>
                {d.formOf && (
                  <button className="link small" onClick={() => onNavigate(d.formOf)}>
                    → {d.formOf}
                  </button>
                )}
                {d.examples.map((ex, k) => (
                  <div key={k} className="example">
                    {ex}
                  </div>
                ))}
              </li>
            ))}
          </ol>
        </section>
      ))}
      <p className="source muted small">Source: Wiktionary (CC BY-SA)</p>
    </div>
  );
}

// Google Translate's own page embedded in the panel (free, no API key). Browsers cannot
// embed it, so the web app opens Google Translate instead. On phones the link is caught by the
// Translate app, which drops the text, so there the text is handed over with the share sheet.
function GoogleTranslate({ text, language }) {
  const [copied, setCopied] = useState(false);
  const url = language.google(text.slice(0, 5000));
  if (window.api.platform === 'web') {
    const phone = window.matchMedia('(hover: none)').matches && navigator.share;
    const open = async () => {
      // Copied as well, so it can be pasted if the text still does not arrive. Not awaited:
      // the share sheet must open straight from the tap.
      navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {});
      if (!phone) return window.api.openExternal(url);
      try {
        await navigator.share({ text });
      } catch (e) {
        if (e.name !== 'AbortError') window.api.openExternal(url);
      }
    };
    return (
      <div>
        <button className="btn google-open" onClick={open}>
          <span className="gt-icon-btn">G</span> {phone ? 'Send to Google Translate' : 'Open in Google Translate ↗'}
        </button>
        <p className="muted small">
          {phone && 'Choose Translate in the list that opens. '}
          {copied && 'The text is also copied — paste it if it does not appear.'}
        </p>
      </div>
    );
  }
  return (
    <webview
      src={url}
      style={{ width: '100%', height: 'max(420px, calc(100vh - 420px))', borderRadius: 10, overflow: 'hidden' }}
    />
  );
}

// The language's own dictionary inside the panel: DWDS for German (German definitions, word
// formation, collocations, corpus examples), Cambridge for English. Cambridge refuses to be
// framed by websites, so the web app offers the big learner's dictionaries as buttons.
function Embed({ word, language }) {
  const { embed } = language;
  const url = embed.url(word);
  if (!embed.frame && window.api.platform === 'web') {
    return (
      <div className="dict-buttons">
        {language.links.slice(0, 4).map((l) => (
          <button key={l.name} className="btn" onClick={() => window.api.openExternal(l.url(word))}>
            {l.name} ↗
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="embed">
      {embed.frame ? (
        <iframe src={url} title={embed.label} referrerPolicy="no-referrer" />
      ) : (
        <webview src={url} />
      )}
      <button className="link small" onClick={() => window.api.openExternal(url)}>
        Open on {new URL(url).hostname.replace(/^www\./, '')} ↗
      </button>
    </div>
  );
}

function PhraseTranslation({ data, text, language }) {
  return (
    <div>
      {!data && <Loading />}
      {data?.error && <p className="error small">Quick translation failed: {data.error}</p>}
      {data && !data.error && (
        <div className="row spread quick-phrase">
          <span>
            <span className="translation">{data.text}</span> <span className="muted small">· {data.provider}</span>
          </span>
        </div>
      )}
      <GoogleTranslate text={text} language={language} />
    </div>
  );
}

function Synonyms({ data, source, onNavigate }) {
  if (!data) return <Loading />;
  const chips = (list) => (
    <div className="chips">
      {list.map((w) => (
        <button key={w} className="chip" onClick={() => onNavigate(w)}>
          {w}
        </button>
      ))}
    </div>
  );
  const empty = !data.synonyms?.length && !data.antonyms?.length && !data.thesaurus?.length;
  return (
    <div>
      {empty && <p className="muted">No synonyms found.</p>}
      {data.synonyms?.length > 0 && (
        <>
          <h4>Synonyms</h4>
          {chips(data.synonyms)}
        </>
      )}
      {data.antonyms?.length > 0 && (
        <>
          <h4>Antonyms</h4>
          {chips(data.antonyms)}
        </>
      )}
      {data.thesaurus?.length > 0 && (
        <>
          <h4>Related</h4>
          {data.thesaurus.map((g, i) => (
            <div key={i}>{chips(g)}</div>
          ))}
        </>
      )}
      {!empty && <p className="source muted small">Source: {source}</p>}
    </div>
  );
}

function Wikipedia({ query, wikis }) {
  const [lang, setLang] = useState(wikis[0][0]);
  const [title, setTitle] = useState(query);
  const [data, setData] = useState(null);

  useEffect(() => setTitle(query), [query]);
  useEffect(() => {
    let alive = true;
    setData(null);
    window.api.wikipedia(title, lang).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [title, lang]);

  return (
    <div className="wiki">
      <div className="seg">
        {wikis.map(([l, name]) => (
          <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
            {name}
          </button>
        ))}
      </div>
      {!data && <Loading />}
      {data && !data.found && <p className="muted">{data.error ? data.error : 'No article found.'}</p>}
      {data?.found && (
        <article>
          {data.thumbnail && <img src={data.thumbnail} alt="" />}
          <h4>{data.title}</h4>
          {data.description && <p className="muted small">{data.description}</p>}
          <p>{data.extract}</p>
          {data.url && (
            <button className="link" onClick={() => window.api.openExternal(data.url)}>
              Read full article ↗
            </button>
          )}
          {data.alternatives?.length > 0 && (
            <>
              <h4>Other articles</h4>
              <div className="chips">
                {data.alternatives.map((t) => (
                  <button key={t} className="chip" onClick={() => setTitle(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}
        </article>
      )}
    </div>
  );
}
