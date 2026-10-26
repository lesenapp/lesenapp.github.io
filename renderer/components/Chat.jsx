import { Fragment, useEffect, useRef, useState } from 'react';
import { usePersisted } from '../lib/usePersisted.js';
import { KEY_PAGE, askGemini } from '../lib/gemini.js';

const EXAMPLES = [
  'Explain the word “anrufen” – is it separable?',
  'Analyse: “Weil ich gestern keine Zeit hatte, habe ich ihn nicht angerufen.”',
  'Break down “Krankenversicherungskarte”.',
  'When do I use “wenn” and when “als”?',
];

// Free-form chat with Gemini about German words and sentences. The conversation is kept per
// profile on this device; `incoming` is a question sent from the word panel ("Ask AI").
export default function Chat({ profileId, settings, incoming, onOpenSettings }) {
  const [messages, setMessages] = usePersisted(profileId, 'chat', []);
  const [draft, setDraft] = useState('');
  const [answer, setAnswer] = useState(null); // text streaming in, null when idle
  const [error, setError] = useState('');
  const abort = useRef(null);
  const end = useRef();
  const handled = useRef(null);
  const key = settings.geminiKey?.trim();

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages, answer]);

  useEffect(() => () => abort.current?.abort(), []);

  const send = (text) => {
    text = text.trim();
    if (!text || answer !== null || !messages) return;
    if (!key) {
      setDraft(text);
      return;
    }
    setDraft('');
    run([...messages, { role: 'user', text }]);
  };

  // Asks Gemini to answer the last (user) message of `history`.
  const run = async (history) => {
    setMessages(history);
    setError('');
    setAnswer('');
    abort.current = new AbortController();
    try {
      const reply = await askGemini({
        key,
        model: settings.geminiModel,
        history: history.slice(-20),
        onText: setAnswer,
        signal: abort.current.signal,
      });
      setMessages([...history, { role: 'model', text: reply }]);
    } catch (e) {
      if (e.name === 'AbortError') {
        setAnswer((partial) => {
          if (partial) setMessages([...history, { role: 'model', text: partial + ' …' }]);
          return null;
        });
        return;
      }
      setError(e.message === 'Failed to fetch' ? 'No connection to Gemini. Check the internet connection.' : e.message);
    }
    setAnswer(null);
  };

  useEffect(() => {
    if (!incoming || !messages || handled.current === incoming.id) return;
    handled.current = incoming.id;
    if (key) send(incoming.text);
    else setDraft(incoming.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming, messages]);

  if (!messages) return <div className="loading">Loading…</div>;

  const busy = answer !== null;
  // What "Gemini app" copies: the text being typed, else the last question asked here.
  const appQuestion = draft.trim() || messages.findLast((m) => m.role === 'user')?.text || '';
  return (
    <div className="chat">
      <div className="chat-scroll">
        <div className="page-wrap narrow">
          <header className="view-head">
            <div>
              <h1>Chat</h1>
              <p className="muted">Ask Gemini about words, sentences and grammar</p>
            </div>
            {messages.length > 0 && (
              <button className="btn ghost" disabled={busy} onClick={() => setMessages([])}>
                New chat
              </button>
            )}
          </header>

          {!key && <KeySetup onOpenSettings={onOpenSettings} draft={draft} />}

          {key && messages.length === 0 && !busy && (
            <div className="chat-examples">
              <p className="muted small">
                Paste a word or a sentence, or tap <b>✦ Ask AI</b> in the word panel while reading. For example:
              </p>
              {EXAMPLES.map((q) => (
                <button key={q} className="chip" onClick={() => send(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}

          <div className="messages">
            {messages.map((m, i) => (
              <Message key={i} role={m.role} text={m.text} />
            ))}
            {busy && (answer ? <Message role="model" text={answer} /> : <div className="msg model typing">Thinking…</div>)}
            {error && (
              <div className="msg error-msg">
                {error}{' '}
                {messages.at(-1)?.role === 'user' && (
                  <button className="link" onClick={() => run(messages)}>
                    Try again
                  </button>
                )}
              </div>
            )}
            <div ref={end} />
          </div>
        </div>
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <textarea
          className="input"
          rows={2}
          value={draft}
          placeholder={key ? 'Ask about a word or paste a sentence…' : 'Add your Gemini key in Settings first'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(draft);
            }
          }}
        />
        {busy ? (
          <button type="button" className="btn" onClick={() => abort.current?.abort()}>
            Stop
          </button>
        ) : (
          <button className="btn primary" disabled={!draft.trim() || !key}>
            Send
          </button>
        )}
        <button
          type="button"
          className="btn ghost"
          disabled={!appQuestion}
          title="Copy the question and open the Gemini app (your Gemini Pro plan, e.g. 4 Argon) – paste it there"
          onClick={() => openInGeminiApp(appQuestion)}
        >
          Gemini app ↗
        </button>
      </form>
    </div>
  );
}

function KeySetup({ onOpenSettings, draft }) {
  return (
    <section className="card key-setup">
      <h3>Connect Gemini (free, one time)</h3>
      <ol>
        <li>
          Open{' '}
          <button className="link" onClick={() => window.api.openExternal(KEY_PAGE)}>
            Google AI Studio → API keys ↗
          </button>{' '}
          and sign in with your Google account.
        </li>
        <li>Click “Create API key”, then copy it.</li>
        <li>
          Paste it in{' '}
          <button className="link" onClick={onOpenSettings}>
            Settings → Gemini API key
          </button>
          .
        </li>
      </ol>
      <p className="muted small">
        The key uses Gemini’s free tier: no card, no charges. It is stored only on this device, so add it once on each
        phone/computer.
      </p>
      {draft && (
        <p className="small">
          Or ask in the Gemini app now:{' '}
          <button className="link" onClick={() => openInGeminiApp(draft)}>
            copy the question and open Gemini ↗
          </button>
        </p>
      )}
    </section>
  );
}

// The Gemini app/site has no way to receive a question, so it goes through the clipboard.
export function openInGeminiApp(text) {
  const prompt = `${text}\n\n(I'm learning German. Explain as a German tutor, in English: meaning, word formation, word order, case, verb forms, separable verbs – concise.)`;
  navigator.clipboard?.writeText(prompt).catch(() => {});
  window.api.openExternal('https://gemini.google.com/app');
}

function Message({ role, text }) {
  return (
    <div className={`msg ${role}`}>
      {role === 'user' ? text : <Markdown text={text} />}
      {role === 'model' && (
        <button className="msg-copy link small" onClick={() => navigator.clipboard?.writeText(text)} title="Copy">
          Copy
        </button>
      )}
    </div>
  );
}

// Just enough Markdown for tutor answers: headings, lists, tables, bold/italic/code.
function Markdown({ text }) {
  const blocks = [];
  let list = null;
  let table = null;
  const flush = () => {
    if (list) blocks.push(list);
    if (table) blocks.push(table);
    list = table = null;
  };

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    let m;
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (list) flush();
      const cells = line.trim().slice(1, -1).split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      table ??= { type: 'table', rows: [] };
      table.rows.push(cells);
    } else if ((m = line.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)/))) {
      if (table) flush();
      const ordered = Boolean(m[1]);
      if (list && list.ordered !== ordered) flush();
      list ??= { type: 'list', ordered, items: [] };
      list.items.push({ text: m[2], indent: raw.search(/\S/) >= 2 });
    } else {
      flush();
      if ((m = line.match(/^(#{1,6})\s+(.*)/))) blocks.push({ type: 'h', text: m[2] });
      else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) blocks.push({ type: 'hr' });
      else if (line.trim()) blocks.push({ type: 'p', text: line });
    }
  }
  flush();

  return (
    <div className="md">
      {blocks.map((b, i) => {
        if (b.type === 'h') return <h4 key={i}>{inline(b.text)}</h4>;
        if (b.type === 'hr') return <hr key={i} />;
        if (b.type === 'p') return <p key={i}>{inline(b.text)}</p>;
        if (b.type === 'table')
          return (
            <div key={i} className="md-table">
              <table>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((c, k) => (j === 0 ? <th key={k}>{inline(c)}</th> : <td key={k}>{inline(c)}</td>))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        const Tag = b.ordered ? 'ol' : 'ul';
        return (
          <Tag key={i}>
            {b.items.map((it, j) => (
              <li key={j} className={it.indent ? 'sub' : ''}>
                {inline(it.text)}
              </li>
            ))}
          </Tag>
        );
      })}
    </div>
  );
}

function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g).map((part, i) => {
    if (/^\*\*.+\*\*$/.test(part)) return <b key={i}>{inline(part.slice(2, -2))}</b>;
    if (/^`.+`$/.test(part)) return <code key={i}>{part.slice(1, -1)}</code>;
    if (/^(\*|_).+\1$/.test(part)) return <i key={i}>{part.slice(1, -1)}</i>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
