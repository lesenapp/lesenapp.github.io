import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { paginate, sentenceAround, tokenize, wordKey } from '../lib/text.js';
import { upsert, remove } from '../lib/words.js';
import { useBackButton } from '../lib/useBackButton.js';
import WordPanel from './WordPanel.jsx';

export default function Reader({ text, words, setWords, settings, onUpdateText, onBack, onAsk }) {
  const paragraphs = useMemo(() => tokenize(text.content), [text.content]);
  const pages = useMemo(() => paginate(paragraphs, settings.wordsPerPage), [paragraphs, settings.wordsPerPage]);
  const [page, setPage] = useState(() => Math.min(text.page || 0, pages.length - 1));
  const [sel, setSel] = useState(null);
  const pageRef = useRef();
  useBackButton(Boolean(sel), () => setSel(null));

  useEffect(() => {
    onUpdateText({ page, opened: Date.now() });
    pageRef.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const record = sel ? words[sel.key] : null;

  // Every change to the selected word goes through here; context and source are refreshed each time.
  const patchSelected = useCallback(
    (patch) => {
      if (!sel) return;
      if (patch === null) return setWords((ws) => remove(ws, sel.key));
      setWords((ws) =>
        upsert(ws, sel.key, {
          word: ws[sel.key]?.word ?? sel.text,
          isPhrase: sel.kind === 'phrase',
          ...(sel.context ? { context: sel.context, textId: text.id } : {}),
          ...patch,
        })
      );
    },
    [sel, setWords, text.id]
  );

  const selectToken = (pi, ti) => {
    const p = paragraphs[pi];
    const tok = p.tokens[ti];
    setSel({
      kind: 'word',
      text: tok.text,
      key: tok.key,
      context: sentenceAround(p.text, tok.start, tok.start + tok.text.length),
      pos: `${pi}:${ti}`,
    });
  };

  const onClick = (e) => {
    const el = e.target.closest('[data-t]');
    if (!el) return;
    if (window.getSelection().toString().trim().includes(' ')) return;
    const [pi, ti] = el.dataset.t.split(':').map(Number);
    selectToken(pi, ti);
  };

  const onMouseUp = () => {
    const s = window.getSelection();
    const phrase = s.toString().replace(/\s+/g, ' ').trim();
    if (!phrase.includes(' ') || phrase.length > 160 || !pageRef.current?.contains(s.anchorNode)) return;
    const para = s.anchorNode.parentElement?.closest('[data-p]');
    const p = para ? paragraphs[Number(para.dataset.p)] : null;
    const at = p ? p.text.indexOf(phrase) : -1;
    setSel({
      kind: 'phrase',
      text: phrase,
      key: wordKey(phrase),
      context: at >= 0 ? sentenceAround(p.text, at, at + phrase.length) : phrase,
    });
  };

  // Phones select text with a long press and handles; there is no mouseup, so react to the
  // selection itself once it has settled.
  useEffect(() => {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    let timer = null;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(onMouseUp, 700);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', onChange);
    };
  });

  const navigate = (word) => setSel({ kind: 'word', text: word, key: wordKey(word), context: '' });

  const goto = (n) => {
    setSel(null);
    setPage(Math.max(0, Math.min(pages.length - 1, n)));
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') return setSel(null);
      if (sel && e.key === 'f') return patchSelected({ favorite: !record?.favorite });
      if (e.key === 'ArrowRight') goto(page + 1);
      if (e.key === 'ArrowLeft') goto(page - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onPage = pages[page] || [];
  const isLast = page >= pages.length - 1;

  return (
    <div className={`reader ${sel ? 'with-panel' : ''}`}>
      <div className="reader-main">
        <header className="reader-head">
          <button className="btn ghost" onClick={onBack}>
            ← Library
          </button>
          <div className="reader-title">{text.title}</div>
          <div className="muted small">
            Page {page + 1} / {pages.length}
          </div>
        </header>

        <div className="reader-scroll" ref={pageRef}>
          <article
            className="reading"
            style={{ fontSize: settings.fontSize }}
            onClick={onClick}
            onMouseUp={onMouseUp}
          >
            {onPage.map((pi) => (
              <p key={pi} data-p={pi}>
                {paragraphs[pi].tokens.map((tok, ti) =>
                  tok.type === 'gap' ? (
                    tok.text
                  ) : (
                    <span
                      key={ti}
                      data-t={`${pi}:${ti}`}
                      className={`w${words[tok.key] ? ' saved' : ''}${words[tok.key]?.favorite ? ' fav' : ''}${
                        sel?.pos === `${pi}:${ti}` ? ' sel' : ''
                      }`}
                    >
                      {tok.text}
                    </span>
                  )
                )}
              </p>
            ))}
          </article>

          <footer className="pager">
            <button className="btn" onClick={() => goto(page - 1)} disabled={page === 0}>
              ← Previous
            </button>
            <button className="btn primary" onClick={() => goto(page + 1)} disabled={isLast}>
              Next →
            </button>
          </footer>
          <p className="hint muted small">
            Click a word to look it up · drag across words for a phrase · F favourite · ←/→ pages
          </p>
        </div>
      </div>

      {sel && (
        <WordPanel
          key={sel.key + sel.kind}
          sel={sel}
          record={record}
          settings={settings}
          onPatch={patchSelected}
          onNavigate={navigate}
          onAsk={onAsk}
          onClose={() => setSel(null)}
        />
      )}
    </div>
  );
}
