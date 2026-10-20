import { useEffect, useMemo, useRef, useState } from 'react';
import { articleOf, remove, upsert } from '../lib/words.js';
import { wordKey } from '../lib/text.js';
import WordPanel from './WordPanel.jsx';
import {
  ankiConnectStatus,
  buildApkg,
  deliverPackage,
  importViaAnkiConnect,
  pendingForAnki,
  requestAnkiPermission,
  sentStamp,
} from '../lib/anki.js';

export default function Vocabulary({ words, setWords, texts, settings, onOpen }) {
  const [onlyFavourites, setOnlyFavourites] = useState(false);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(null); // word shown in the side panel, as in the reader

  const select = (w) => setSel({ kind: w.isPhrase ? 'phrase' : 'word', text: w.word, key: w.key, context: w.context || '' });
  const patchSelected = (p) =>
    setWords((ws) =>
      p === null
        ? remove(ws, sel.key)
        : upsert(ws, sel.key, { word: ws[sel.key]?.word ?? sel.text, isPhrase: sel.kind === 'phrase', ...p })
    );

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setSel(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const all = useMemo(() => Object.values(words), [words]);
  const favourites = all.filter((w) => w.favorite).length;

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((w) => !onlyFavourites || w.favorite)
      .filter(
        (w) =>
          !q ||
          w.key.includes(q) ||
          (w.lemma || '').toLowerCase().includes(q) ||
          (w.translation || '').toLowerCase().includes(q)
      )
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  }, [all, onlyFavourites, query]);

  const patch = (key, p) => setWords((ws) => upsert(ws, key, p));
  const titles = Object.fromEntries(texts.map((t) => [t.id, t.title]));

  return (
    <div className="split">
      <div className="split-main">
        <div className="page-wrap">
          <header className="view-head">
            <div>
              <h1>My words</h1>
              <p className="muted">
                {all.length} saved{favourites > 0 && ` · ${favourites} favourites`}
              </p>
            </div>
            <input className="input search" placeholder="Search words or meanings" value={query} onChange={(e) => setQuery(e.target.value)} />
          </header>
    
          <AnkiBar words={words} setWords={setWords} deck={settings.ankiDeck || 'Lesen'} />
    
          {favourites > 0 && (
            <div className="seg wide">
              <button className={!onlyFavourites ? 'on' : ''} onClick={() => setOnlyFavourites(false)}>
                All
              </button>
              <button className={onlyFavourites ? 'on' : ''} onClick={() => setOnlyFavourites(true)}>
                ★ Favourites
              </button>
            </div>
          )}
    
          {list.length === 0 ? (
            <div className="empty">
              <p>{query ? 'No matches.' : 'Words you look up while reading appear here.'}</p>
            </div>
          ) : (
            <div className="vocab">
              {list.map((w) => (
                <WordRow
                  key={w.key}
                  w={w}
                  selected={sel?.key === w.key}
                  source={titles[w.textId]}
                  onSelect={() => select(w)}
                  onPatch={(p) => patch(w.key, p)}
                  onOpen={onOpen}
                  onRemove={() => setWords((ws) => remove(ws, w.key))}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {sel && (
        <WordPanel
          key={sel.key + sel.kind}
          sel={sel}
          record={words[sel.key]}
          settings={settings}
          onPatch={patchSelected}
          onNavigate={(word) => setSel({ kind: 'word', text: word, key: wordKey(word), context: '' })}
          onClose={() => setSel(null)}
        />
      )}
    </div>
  );
}

function WordRow({ w, selected, source, onSelect, onPatch, onOpen, onRemove }) {
  const article = articleOf(w);
  const head = !w.isPhrase && w.lemma ? w.lemma : w.word;
  const showForm = head.toLowerCase() !== w.word.toLowerCase();

  return (
    <div className={`vrow ${selected ? 'selected' : ''}`}>
      <button className={`icon-btn star ${w.favorite ? 'on' : ''}`} title="Favourite" onClick={() => onPatch({ favorite: !w.favorite })}>
        {w.favorite ? '★' : '☆'}
      </button>

      <div className="vmain" onClick={onSelect} title="Show dictionary">
        <div className="vword">
          {article && <span className={`article g-${w.gender}`}>{article}</span>}
          <span className="vhead">{head}</span>
          {article && w.plural && <span className="muted">, {w.plural}</span>}
          {showForm && <span className="muted small">{w.word}</span>}
        </div>
        {w.context && (
          <div className="vctx" title={w.context}>
            {w.context}
            {source && (
              <button
                className="link small"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(w.textId);
                }}
              >
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

      <span className={`vanki ${w.ankiSig ? 'on' : ''}`} title={w.ankiSig ? 'In Anki' : 'Not in Anki yet'}>
        {w.ankiSig ? '✓ Anki' : ''}
      </span>

      <button className="icon-btn vdel" title="Remove" onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}

const isPhone = () => window.matchMedia('(pointer: coarse)').matches;

// One button that sends every new or changed saved word to the same Anki deck.
function AnkiBar({ words, setWords, deck }) {
  const pending = useMemo(() => pendingForAnki(words), [words]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const prebuilt = useRef(null);
  const sharesFile = isPhone() && !window.api.openAnkiPackage;

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

  const count = (n) => `${n} ${n === 1 ? 'word' : 'words'}`;

  const send = async () => {
    setResult(null);
    setBusy(true);
    try {
      if (sharesFile && prebuilt.current) {
        const { bytes, list } = prebuilt.current;
        const how = await deliverPackage(bytes);
        stamp(list);
        setResult({
          ok: true,
          text: how === 'shared' ? `${count(list.length)} sent to Anki.` : `${count(list.length)} downloaded — open the file to add them to Anki.`,
        });
        return;
      }

      const list = pending;
      let status = await ankiConnectStatus();
      if (status === 'forbidden') {
        setResult({ ok: true, text: 'Click “Yes” in the Anki window to allow Lesen…' });
        status = (await requestAnkiPermission()) ? 'ready' : 'forbidden';
      }
      if (status === 'forbidden') throw new Error('Anki did not allow access. Press Send again and choose “Yes” in Anki.');

      const bytes = await buildApkg(list, deck);
      if (status === 'ready') {
        const synced = await importViaAnkiConnect(bytes);
        stamp(list);
        setResult({ ok: true, text: `${count(list.length)} added to “${deck}”${synced ? ' and synced to AnkiWeb' : ''}.` });
        return;
      }
      const how = await deliverPackage(bytes);
      stamp(list);
      setResult({
        ok: true,
        text:
          how === 'opened'
            ? `${count(list.length)} — Anki is adding them to “${deck}”.`
            : `Couldn't reach Anki, so ${count(list.length)} were downloaded as a file — open it to add them. For one-click sending, keep Anki open and allow “Local network access” for this site (lock icon in the address bar), or use the Lesen desktop app.`,
      });
    } catch (e) {
      if (e.name !== 'AbortError') setResult({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const newCount = pending.filter((w) => !w.ankiSig).length;
  const changedCount = pending.length - newCount;
  const summary = pending.length
    ? [newCount && `${newCount} new`, changedCount && `${changedCount} updated`].filter(Boolean).join(' · ') + ' to send'
    : 'Everything is in Anki';

  return (
    <section className="anki-bar card">
      <div className="anki-logo">A</div>
      <div className="anki-info">
        <div className="anki-title">
          Anki <span className="muted">· deck “{deck}”</span>
        </div>
        <div className="muted small">{summary}</div>
        {result && <div className={`small ${result.ok ? 'anki-ok' : 'error'}`}>{result.text}</div>}
      </div>
      <button className="btn primary" onClick={send} disabled={busy || !pending.length}>
        {busy ? 'Sending…' : 'Send to Anki'}
      </button>
    </section>
  );
}
