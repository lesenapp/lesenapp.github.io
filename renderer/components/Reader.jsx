import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { paginate, sentenceAround, sentenceRanges, tokenize, wordKey } from '../lib/text.js';
import { upsert, remove } from '../lib/words.js';
import { loadGenders, nounGender, separableParticle } from '../lib/grammar.js';
import { speakThen, unlockSpeech } from '../lib/speech.js';
import { useBackButton } from '../lib/useBackButton.js';
import WordPanel from './WordPanel.jsx';

// How long a page has to stay open to count as read for the daily total.
const READ_AFTER_MS = 15_000;

export default function Reader({ text, words, setWords, settings, onUpdateText, onBack, onRead }) {
  const paragraphs = useMemo(() => tokenize(text.content), [text.content]);
  const pages = useMemo(() => paginate(paragraphs, settings.wordsPerPage), [paragraphs, settings.wordsPerPage]);
  const [page, setPage] = useState(() => Math.min(text.page || 0, pages.length - 1));
  const [sel, setSel] = useState(null);
  const pageRef = useRef();
  const [gendersReady, setGendersReady] = useState(false);
  const [speaking, setSpeaking] = useState(null); // { pi, si }: sentence being read aloud
  useBackButton(Boolean(sel), () => setSel(null));

  useEffect(() => {
    if (!settings.genderColors) return;
    let alive = true;
    loadGenders().then(() => alive && setGendersReady(true));
    return () => {
      alive = false;
    };
  }, [settings.genderColors]);

  useEffect(() => {
    onUpdateText({ page, opened: Date.now() });
    pageRef.current?.scrollTo({ top: 0 });
    const count = (pages[page] || []).reduce(
      (n, pi) => n + paragraphs[pi].tokens.filter((t) => t.type === 'word').length,
      0
    );
    const timer = setTimeout(() => onRead(`${text.id}:${page}`, count), READ_AFTER_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Noun gender per word on this page ("pi:ti" → m/f/n); a saved word's own gender comes first.
  const pageGenders = useMemo(() => {
    const out = {};
    if (!settings.genderColors || !gendersReady) return out;
    for (const pi of pages[page] || []) {
      let start = true;
      paragraphs[pi].tokens.forEach((tok, ti) => {
        if (tok.type === 'gap') {
          if (/[.!?…:„“"«»]/.test(tok.text)) start = true;
          return;
        }
        const g = nounGender(tok.text, start);
        if (g) out[`${pi}:${ti}`] = g;
        start = false;
      });
    }
    return out;
  }, [settings.genderColors, gendersReady, pages, page, paragraphs]);

  const genderOf = (pi, ti, tok) => {
    const w = words[tok.key];
    if (w?.gender && 'mfn'.includes(w.gender) && /^\p{Lu}/u.test(tok.text) && /^\p{Lu}/u.test(w.lemma || '')) {
      return w.gender;
    }
    return pageGenders[`${pi}:${ti}`];
  };

  // ---------- Reading aloud, sentence by sentence, on to the next pages ----------

  const ranges = useMemo(() => paragraphs.map((p) => sentenceRanges(p.text)), [paragraphs]);

  useEffect(() => {
    if (!speaking) return;
    const { pi, si } = speaking;
    const r = ranges[pi][si];
    const next = () => {
      if (si + 1 < ranges[pi].length) return setSpeaking({ pi, si: si + 1 });
      const onThisPage = pages[page];
      const at = onThisPage.indexOf(pi);
      if (at + 1 < onThisPage.length) return setSpeaking({ pi: onThisPage[at + 1], si: 0 });
      if (page + 1 < pages.length && pages[page + 1].length) {
        setPage(page + 1);
        return setSpeaking({ pi: pages[page + 1][0], si: 0 });
      }
      setSpeaking(null);
    };
    const stop = speakThen(paragraphs[pi].text.slice(r.start, r.end), settings.speechRate, next);
    pageRef.current?.querySelector('.speaking')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaking]);

  const toggleSpeaking = () => {
    if (speaking) return setSpeaking(null);
    unlockSpeech();
    // From the selected word's sentence, else from the top of the page.
    const [spi, sti] = sel?.pos?.split(':').map(Number) ?? [];
    if (spi !== undefined && pages[page].includes(spi)) {
      const at = paragraphs[spi].tokens[sti].start;
      const si = Math.max(0, ranges[spi].findIndex((r) => at >= r.start && at < r.end));
      return setSpeaking({ pi: spi, si });
    }
    if (pages[page].length) setSpeaking({ pi: pages[page][0], si: 0 });
  };

  const speakingRange = speaking ? ranges[speaking.pi][speaking.si] : null;

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
      particle: separableParticle(p.tokens, ti),
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
    setSpeaking(null);
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
          <button
            className={`icon-btn listen ${speaking ? 'on' : ''}`}
            title={speaking ? 'Stop reading aloud' : 'Read aloud'}
            onClick={toggleSpeaking}
          >
            {speaking ? '■' : '▶'}
          </button>
          <div className="muted small">
            {page + 1} / {pages.length}
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
                      }${genderOf(pi, ti, tok) ? ` g${genderOf(pi, ti, tok)}` : ''}${
                        speaking?.pi === pi && tok.start >= speakingRange.start && tok.start < speakingRange.end
                          ? ' speaking'
                          : ''
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
          key={sel.key + sel.kind + (sel.particle ?? '')}
          sel={sel}
          record={record}
          settings={settings}
          onPatch={patchSelected}
          onNavigate={navigate}
          onClose={() => setSel(null)}
        />
      )}
    </div>
  );
}
