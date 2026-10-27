import { useMemo, useRef, useState } from 'react';
import { countWords } from '../lib/text.js';
import { readEpub } from '../lib/epub.js';
import { useBackButton } from '../lib/useBackButton.js';

const SAMPLE = {
  title: 'Ein Morgen in Berlin',
  content: `Es ist sieben Uhr morgens, und die Stadt wacht langsam auf. Anna steht am Fenster ihrer kleinen Wohnung und trinkt einen Kaffee. Draußen fährt die erste Straßenbahn vorbei.

Heute hat sie viel vor. Zuerst möchte sie auf den Markt gehen, um frisches Obst und Brot zu kaufen. Danach trifft sie ihren Bruder in einem Café am Kanal. Er ist gerade aus München zurückgekommen und will ihr von seiner Reise erzählen.

Der Himmel ist grau, aber Anna lässt sich die Laune nicht verderben. Sie nimmt ihren Regenschirm, zieht die Jacke an und geht die Treppe hinunter. Auf der Straße riecht es nach frischen Brötchen.`,
};

// Free German texts, easy to hard.
const SOURCES = [
  { name: 'nachrichtenleicht.de', note: 'A2', url: 'https://www.nachrichtenleicht.de' },
  { name: 'DW Top-Thema', note: 'B1', url: 'https://learngerman.dw.com/de/top-thema/s-55801700' },
  { name: 'Langsam gesprochene Nachrichten', note: 'B2', url: 'https://learngerman.dw.com/de/langsam-gesprochene-nachrichten/s-60040332' },
  { name: 'Projekt Gutenberg', note: 'books', url: 'https://www.projekt-gutenberg.org' },
];

export default function Library({ texts, setTexts, words, reading, onOpen }) {
  const [editing, setEditing] = useState(null);
  useBackButton(Boolean(editing), () => setEditing(null));

  const save = (draft) => {
    if (draft.id) setTexts((list) => list.map((t) => (t.id === draft.id ? { ...t, ...draft } : t)));
    else setTexts((list) => [{ ...draft, id: crypto.randomUUID(), created: Date.now(), page: 0 }, ...list]);
    setEditing(null);
  };

  const sorted = [...texts].sort((a, b) => (b.opened ?? b.created) - (a.opened ?? a.created));

  return (
    <div className="page-wrap">
      <header className="view-head">
        <div>
          <h1>Library</h1>
          <p className="muted">
            {reading.today.toLocaleString()} words read today
            {reading.streak > 1 && ` · 🔥 ${reading.streak} days in a row`}
          </p>
        </div>
        <button className="btn primary" onClick={() => setEditing({ title: '', content: '' })}>
          + New text
        </button>
      </header>

      {texts.length === 0 && (
        <div className="empty">
          <p>No texts yet.</p>
          <div className="row center">
            <button className="btn primary" onClick={() => setEditing({ title: '', content: '' })}>
              Add your first text
            </button>
            <button className="btn" onClick={() => save(SAMPLE)}>
              Add a sample text
            </button>
          </div>
        </div>
      )}

      <div className="cards">
        {sorted.map((t) => (
          <TextCard
            key={t.id}
            text={t}
            words={words}
            onOpen={() => onOpen(t.id)}
            onEdit={() => setEditing(t)}
            onDelete={() => {
              if (confirm(`Delete "${t.title}"? Your saved words stay in your vocabulary.`)) {
                setTexts((list) => list.filter((x) => x.id !== t.id));
              }
            }}
          />
        ))}
      </div>

      <footer className="sources">
        <span className="muted small">Find texts</span>
        {SOURCES.map((s) => (
          <button key={s.url} className="chip" onClick={() => window.api.openExternal(s.url)}>
            {s.name} <span className="muted">· {s.note}</span>
          </button>
        ))}
      </footer>

      {editing && <TextEditor draft={editing} onSave={save} onCancel={() => setEditing(null)} />}
    </div>
  );
}

function TextCard({ text, words, onOpen, onEdit, onDelete }) {
  const total = useMemo(() => countWords(text.content), [text.content]);
  const saved = useMemo(() => Object.values(words).filter((w) => w.textId === text.id).length, [words, text.id]);

  return (
    <div className="card text-card" onClick={onOpen}>
      <h3>{text.title}</h3>
      <p className="excerpt">{text.content.slice(0, 160)}…</p>
      <div className="card-foot">
        <span className="muted">
          {total.toLocaleString()} words{saved > 0 && ` · ${saved} saved`}
        </span>
        <span className="card-actions" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn" onClick={onEdit} title="Edit">
            ✎
          </button>
          <button className="icon-btn" onClick={onDelete} title="Delete">
            🗑
          </button>
        </span>
      </div>
    </div>
  );
}

function TextEditor({ draft, onSave, onCancel }) {
  const [title, setTitle] = useState(draft.title);
  const [content, setContent] = useState(draft.content);
  const fileRef = useRef();
  const [fileError, setFileError] = useState('');

  const loadFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileError('');
    const name = file.name.replace(/\.[^.]+$/, '');
    try {
      if (/\.epub$/i.test(file.name)) {
        const book = readEpub(await file.arrayBuffer());
        setContent(book.content);
        if (!title) setTitle(book.title || name);
        return;
      }
      setContent(await file.text());
      if (!title) setTitle(name);
    } catch (err) {
      setFileError(err.message);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{draft.id ? 'Edit text' : 'New text'}</h2>
        <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <textarea
          className="input textarea"
          placeholder="Paste German text here…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="row spread">
          <div>
            <input ref={fileRef} type="file" accept=".txt,.md,.srt,.epub" hidden onChange={loadFile} />
            <button className="btn" onClick={() => fileRef.current.click()}>
              Open file (.txt, .epub)
            </button>
            {fileError && <span className="error small"> {fileError}</span>}
          </div>
          <div className="row">
            <button className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button
              className="btn primary"
              disabled={!content.trim()}
              onClick={() => onSave({ ...draft, title: title.trim() || 'Untitled', content })}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
