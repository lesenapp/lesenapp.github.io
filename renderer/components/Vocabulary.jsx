import { useEffect, useMemo, useRef, useState } from 'react';
import { IGNORED, KNOWN, STATUS_LABELS, articleOf, isLearning, remove, upsert } from '../lib/words.js';
import {
  ankiConnectAvailable,
  buildApkg,
  deliverPackage,
  importViaAnkiConnect,
  pendingForAnki,
  sentStamp,
} from '../lib/anki.js';
import { speak } from '../lib/speech.js';

const FILTERS = [
  { id: 'learning', label: 'Learning', test: isLearning },
  { id: 'favorites', label: 'Favourites', test: (w) => w.favorite },
  { id: 'known', label: 'Known', test: (w) => w.status === KNOWN },
  { id: 'all', label: 'All', test: () => true },
];

export default function Vocabulary({ words, setWords, texts, settings, onOpen }) {
  const [filter, setFilter] = useState('learning');
  const [query, setQuery] = useState('');

  const all = useMemo(() => Object.values(words), [words]);
  const counts = useMemo(
    () => ({
      learning: all.filter(isLearning).length,
      favorites: all.filter((w) => w.favorite).length,
      known: all.filter((w) => w.status === KNOWN && !w.isPhrase).length,
    }),
    [all]
  );

  const list = useMemo(() => {
    const test = FILTERS.find((f) => f.id === filter).test;
    const q = query.trim().toLowerCase();
    return all
      .filter(test)
      .filter(
        (w) =>
          !q ||
          w.key.includes(q) ||
          (w.lemma || '').toLowerCase().includes(q) ||
          (w.translation || '').toLowerCase().includes(q)
      )
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  }, [all, filter, query]);

  const patch = (key, p) => setWords((ws) => upsert(ws, key, p));
  const titles = Object.fromEntries(texts.map((t) => [t.id, t.title]));

  return (
    <div className="page-wrap">
      <header className="view-head">
        <div>
          <h1>Vocabulary</h1>
          <p className="muted">
            {counts.learning} learning · {counts.favorites} favourites · {counts.known} known
          </p>
        </div>
        <input className="input search" placeholder="Search words or meanings" value={query} onChange={(e) => setQuery(e.target.value)} />
      </header>

      <AnkiBar words={words} setWords={setWords} deck={settings.ankiDeck || 'Lesen'} />

      <div className="seg wide">
        {FILTERS.map((f) => (
          <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <p>{query ? 'No matches.' : 'Words you look up while reading appear here.'}</p>
        </div>
      ) : (
        <div className="vocab">
          {list.map((w) => (
            <WordRow key={w.key} w={w} source={titles[w.textId]} onPatch={(p) => patch(w.key, p)} onOpen={onOpen} onRemove={() => setWords((ws) => remove(ws, w.key))} />
          ))}
        </div>
      )}
    </div>
  );
}

function WordRow({ w, source, onPatch, onOpen, onRemove }) {
  const article = articleOf(w);
  const head = article ? w.lemma : w.word;
  const showForm = article && w.word.toLowerCase() !== w.lemma.toLowerCase();
  const inAnki = Boolean(w.ankiSig);

  return (
    <div className="vrow">
      <button className={`icon-btn star ${w.favorite ? 'on' : ''}`} title="Favourite" onClick={() => onPatch({ favorite: !w.favorite })}>
        {w.favorite ? '★' : '☆'}
      </button>

      <div className="vmain">
        <div className="vword">
          {article && <span className={`article g-${w.gender}`}>{article}</span>}
          <button className="link plain" onClick={() => speak(article ? `${article} ${head}` : head)} title="Listen">
            {head}
          </button>
          {showForm && <span className="muted small">{w.word}</span>}
        </div>
        {w.context && (
          <div className="vctx" title={w.context}>
            {w.context}
            {source && (
              <button className="link small" onClick={() => onOpen(w.textId)}>
                {' '}
                — {source}
              </button>
            )}
          </div>
        )}
      </div>

      <input
        className="input vmeaning"
        value={w.translation ?? ''}
        placeholder={w.looked || w.isPhrase ? 'Add a meaning' : 'Looking up…'}
        onChange={(e) => onPatch({ translation: e.target.value })}
      />

      <select className="input vstatus" value={w.status} onChange={(e) => onPatch({ status: Number(e.target.value) })}>
        {[1, 2, 3, 4, KNOWN, IGNORED].map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      <span className={`vanki ${inAnki ? 'on' : ''}`} title={inAnki ? 'In Anki' : 'Not in Anki yet'}>
        {inAnki ? '✓ Anki' : ''}
      </span>

      <button className="icon-btn vdel" title="Remove" onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}

// One button that sends every new or changed learning word to the same Anki deck.
function AnkiBar({ words, setWords, deck }) {
  const pending = useMemo(() => pendingForAnki(words), [words]);
  const [live, setLive] = useState(null); // AnkiConnect reachable (Anki open on this computer)?
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const prebuilt = useRef(null);
  const sharesFile = live === false && !window.api.openAnkiPackage;

  useEffect(() => {
    ankiConnectAvailable().then(setLive);
  }, []);

  // Phones may only open the share sheet right after a tap, so the package is built in advance.
  useEffect(() => {
    prebuilt.current = null;
    if (!sharesFile || !pending.length) return;
    let alive = true;
    const t = setTimeout(() => {
      buildApkg(pending, deck).then((bytes) => {
        if (alive) prebuilt.current = { bytes, list: pending };
      });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [pending, deck, sharesFile]);

  const stamp = (list) =>
    setWords((ws) => {
      const next = { ...ws };
      for (const w of list) if (next[w.key]) next[w.key] = { ...next[w.key], ...sentStamp(w) };
      return next;
    });

  const send = async () => {
    setResult(null);
    setBusy(true);
    try {
      let list = pending;
      let message;
      if (live) {
        const synced = await importViaAnkiConnect(await buildApkg(list, deck));
        message = `Added to “${deck}”${synced ? ' and synced with AnkiWeb' : ''}.`;
      } else if (sharesFile && prebuilt.current) {
        list = prebuilt.current.list;
        const how = await deliverPackage(prebuilt.current.bytes);
        message = how === 'shared' ? 'Sent to Anki.' : 'Downloaded — open the file to import it into Anki.';
      } else {
        const how = await deliverPackage(await buildApkg(list, deck));
        message = how === 'opened' ? 'Anki is importing the cards.' : 'Downloaded — open the file to import it into Anki.';
      }
      stamp(list);
      setResult({ ok: true, text: `${list.length} ${list.length === 1 ? 'word' : 'words'} · ${message}` });
    } catch (e) {
      if (e.name !== 'AbortError') setResult({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const newCount = pending.filter((w) => !w.ankiSig).length;
  const changedCount = pending.length - newCount;
  const summary = pending.length
    ? [newCount && `${newCount} new`, changedCount && `${changedCount} updated`].filter(Boolean).join(' · ')
    : 'Everything is in Anki';

  return (
    <section className="anki-bar card">
      <div className="anki-logo">A</div>
      <div className="anki-info">
        <div className="anki-title">
          Anki <span className="muted">· deck “{deck}”</span>
        </div>
        <div className="muted small">
          {summary}
          {live === true && <span className="anki-live"> · connected</span>}
        </div>
        {result && <div className={`small ${result.ok ? 'anki-ok' : 'error'}`}>{result.text}</div>}
      </div>
      <button className="btn primary" onClick={send} disabled={busy || !pending.length}>
        {busy ? 'Sending…' : 'Send to Anki'}
      </button>
    </section>
  );
}
