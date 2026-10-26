import { useEffect, useState } from 'react';
import { LOOKUP_VERSION, articleOf, firstGloss, lookupFields } from '../lib/words.js';
import { speak } from '../lib/speech.js';

const enc = encodeURIComponent;
const LINKS = [
  { name: 'Google Translate', url: (w) => `https://translate.google.com/?sl=de&tl=en&op=translate&text=${enc(w)}` },
  { name: 'Cambridge (German–English)', url: (w) => `https://dictionary.cambridge.org/dictionary/german-english/${enc(w)}` },
  { name: 'Collins (German–English)', url: (w) => `https://www.collinsdictionary.com/dictionary/german-english/${enc(w)}` },
  { name: 'Wiktionary', url: (w) => `https://en.wiktionary.org/wiki/${enc(w)}#German` },
  { name: 'DWDS (German, with corpus examples)', url: (w) => `https://www.dwds.de/wb/${enc(w)}` },
  { name: 'Duden', url: (w) => `https://www.duden.de/suchen/dudenonline/${enc(w)}` },
  { name: 'Linguee (in context)', url: (w) => `https://www.linguee.com/german-english/search?query=${enc(w)}` },
  { name: 'Reverso Context', url: (w) => `https://context.reverso.net/translation/german-english/${enc(w)}` },
  { name: 'dict.cc', url: (w) => `https://www.dict.cc/?s=${enc(w)}` },
  { name: 'Forvo (pronunciation)', url: (w) => `https://forvo.com/word/${enc(w)}/#de` },
];

export default function WordPanel({ sel, record, settings, onPatch, onNavigate, onAsk, onClose }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('dict');
  const isWord = sel.kind === 'word';

  useEffect(() => {
    let alive = true;
    const request = isWord ? window.api.lookup(sel.text) : window.api.translate(sel.text);
    request.then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [isWord, sel.text]);

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
    if (!record.translation?.trim() || record.looked !== LOOKUP_VERSION) {
      onPatch({ ...lookupFields(data), ...(record.translation?.trim() ? {} : { translation: firstGloss(data) }) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const lookupWord = isWord ? data?.lemma || sel.text : sel.text;
  const article = isWord && data ? articleOf(data) : null;
  const isBaseForm = !data?.lemma || data.lemma.toLowerCase() === sel.text.toLowerCase();

  return (
    <aside className="panel">
      <div className="panel-head">
        <div className="panel-word">
          {article && isBaseForm && <span className={`article g-${data.gender}`}>{article}</span>}
          <span className="word">{sel.text}</span>
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
          <button className="icon-btn" title="Listen" onClick={() => speak(sel.text)}>
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
          Base form:{' '}
          {article && <span className={`article g-${data.gender}`}>{article}</span>}{' '}
          <button className="link" onClick={() => onNavigate(data.lemma)}>
            {data.lemma}
          </button>
        </div>
      )}
      {isWord && data?.ipa && <div className="ipa">{data.ipa}</div>}

      <button
        className={`save-btn ${record ? 'on' : ''}`}
        onClick={() => onPatch(record ? null : saveFields())}
        title={record ? 'Remove from my words' : 'Save to my words (sent to Anki)'}
      >
        {record ? '✓ Saved to my words' : '+ Save to my words'}
      </button>
      {onAsk && (
        <button className="btn ask-ai" onClick={() => onAsk(askQuestion(sel, isWord))} title="Explain with Gemini in Chat">
          ✦ Ask AI {isWord ? 'about this word' : 'about this sentence'}
        </button>
      )}

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
          placeholder="Anything to remember (gender, plural, example…)"
          onChange={(e) => onPatch({ note: e.target.value })}
        />
      </label>

      <div className="tabs">
        {[
          ['dict', isWord ? 'Dictionary' : 'Translation'],
          ['google', 'Google'],
          ['dwds', 'DWDS'],
          ['syn', 'Synonyms'],
          ['wiki', 'Wikipedia'],
          ['links', 'More'],
        ]
          .filter(([id]) => isWord || (id !== 'syn' && id !== 'google' && id !== 'dwds'))
          .map(([id, label]) => (
            <button key={id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
      </div>

      <div className="tab-body">
        {tab === 'dict' &&
          (isWord ? (
            <Definitions data={data} onPick={(t) => onPatch({ translation: t })} onNavigate={onNavigate} />
          ) : (
            <PhraseTranslation data={data} record={record} onPatch={onPatch} text={sel.text} />
          ))}
        {tab === 'google' && <GoogleTranslate text={sel.text} />}
        {tab === 'dwds' && <Dwds word={lookupWord} />}
        {tab === 'syn' && <Synonyms data={data} onNavigate={onNavigate} />}
        {tab === 'wiki' && <Wikipedia query={lookupWord} />}
        {tab === 'links' && (
          <ul className="links">
            {LINKS.map((l) => (
              <li key={l.name}>
                <button className="link" onClick={() => window.api.openExternal(l.url(lookupWord))}>
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
// embed it, so the web app opens Google Translate (the app on phones, if installed) instead.
function GoogleTranslate({ text }) {
  const url = `https://translate.google.com/?sl=de&tl=en&op=translate&text=${enc(text.slice(0, 5000))}`;
  if (window.api.platform === 'web') {
    return (
      <button className="btn google-open" onClick={() => window.api.openExternal(url)}>
        <span className="gt-icon-btn">G</span> Open in Google Translate ↗
      </button>
    );
  }
  return (
    <webview
      src={url}
      style={{ width: '100%', height: 'max(420px, calc(100vh - 420px))', borderRadius: 10, overflow: 'hidden' }}
    />
  );
}

// The question "Ask AI" puts in the chat: the word in its sentence, or the selected phrase.
function askQuestion(sel, isWord) {
  const sentence = sel.context?.trim();
  if (!isWord) {
    return sentence && sentence !== sel.text
      ? `Analyse “${sel.text}” in this sentence: “${sentence}”`
      : `Analyse this: “${sel.text}”`;
  }
  return sentence ? `Explain “${sel.text}” in this sentence: “${sentence}”` : `Explain the word “${sel.text}”.`;
}

// DWDS (Digitales Wörterbuch der deutschen Sprache): German definitions, word formation,
// collocations and real corpus examples. Its page is shown inside the panel.
function Dwds({ word }) {
  const url = `https://www.dwds.de/wb/${enc(word)}`;
  return (
    <div className="embed">
      <iframe src={url} title="DWDS" referrerPolicy="no-referrer" />
      <button className="link small" onClick={() => window.api.openExternal(url)}>
        Open on dwds.de ↗
      </button>
    </div>
  );
}

function PhraseTranslation({ data, record, onPatch, text }) {
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
      <GoogleTranslate text={text} />
    </div>
  );
}

function Synonyms({ data, onNavigate }) {
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
          <h4>Related groups</h4>
          {data.thesaurus.map((g, i) => (
            <div key={i}>{chips(g)}</div>
          ))}
          <p className="source muted small">Source: OpenThesaurus.de</p>
        </>
      )}
    </div>
  );
}

function Wikipedia({ query }) {
  const [lang, setLang] = useState('de');
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
        {['de', 'en'].map((l) => (
          <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
            {l === 'de' ? 'Deutsch' : 'English'}
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
