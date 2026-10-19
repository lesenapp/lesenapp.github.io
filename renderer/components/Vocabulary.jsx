import { useMemo, useState } from 'react';
import { IGNORED, KNOWN, STATUS_LABELS, isLearning, remove, upsert } from '../lib/words.js';
import { speak } from '../lib/speech.js';

const FILTERS = [
  { id: 'learning', label: 'Learning', test: isLearning },
  { id: 'favorites', label: '★ Favourites', test: (w) => w.favorite },
  { id: 'phrases', label: 'Phrases', test: (w) => w.isPhrase },
  { id: 'known', label: 'Known', test: (w) => w.status === KNOWN },
  { id: 'ignored', label: 'Ignored', test: (w) => w.status === IGNORED },
  { id: 'all', label: 'All', test: () => true },
];

export default function Vocabulary({ words, setWords, texts, onOpen }) {
  const [filter, setFilter] = useState('learning');
  const [query, setQuery] = useState('');

  const list = useMemo(() => {
    const test = FILTERS.find((f) => f.id === filter).test;
    const q = query.trim().toLowerCase();
    return Object.values(words)
      .filter(test)
      .filter((w) => !q || w.key.includes(q) || (w.translation || '').toLowerCase().includes(q))
      .sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0));
  }, [words, filter, query]);

  const patch = (key, p) => setWords((ws) => upsert(ws, key, p));
  const titles = Object.fromEntries(texts.map((t) => [t.id, t.title]));

  const exportCsv = () => {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = list.map((w) => [w.word, w.translation, w.context, w.note, STATUS_LABELS[w.status]].map(esc).join(','));
    const blob = new Blob([['Word,Meaning,Context,Note,Status', ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lesen-vocabulary.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="page-wrap">
      <header className="view-head">
        <div>
          <h1>Vocabulary</h1>
          <p className="muted">{list.length} words</p>
        </div>
        <div className="row">
          <input className="input search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn" onClick={exportCsv} disabled={!list.length} title="Export (works with Anki import)">
            Export CSV
          </button>
        </div>
      </header>

      <div className="seg wide">
        {FILTERS.map((f) => (
          <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <p>Nothing here yet. Words you look up while reading show up here.</p>
        </div>
      ) : (
        <div className="vocab">
          {list.map((w) => (
            <div key={w.key} className="vocab-row">
              <button className={`icon-btn star ${w.favorite ? 'on' : ''}`} onClick={() => patch(w.key, { favorite: !w.favorite })}>
                {w.favorite ? '★' : '☆'}
              </button>
              <div className="vocab-word">
                <button className="link plain" onClick={() => speak(w.word)} title="Listen">
                  {w.word}
                </button>
                {w.lemma && w.lemma.toLowerCase() !== w.key && <span className="muted small"> ({w.lemma})</span>}
              </div>
              <input
                className="input slim"
                value={w.translation ?? ''}
                placeholder="meaning"
                onChange={(e) => patch(w.key, { translation: e.target.value })}
              />
              <div className="vocab-context muted small" title={w.context}>
                {w.context}
                {w.textId && titles[w.textId] && (
                  <button className="link small" onClick={() => onOpen(w.textId)}>
                    {' '}
                    — {titles[w.textId]}
                  </button>
                )}
              </div>
              <select
                className={`input slim status-select sb${w.status}`}
                value={w.status}
                onChange={(e) => patch(w.key, { status: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, KNOWN, IGNORED].map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <button
                className="icon-btn"
                title="Remove"
                onClick={() => setWords((ws) => remove(ws, w.key))}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
