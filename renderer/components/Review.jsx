import { useEffect, useMemo, useState } from 'react';
import { ARTICLES, KNOWN, isLearning, upsert } from '../lib/words.js';
import { GRADES, describeDelay, isDue, schedule, startOfToday } from '../lib/srs.js';
import { speak } from '../lib/speech.js';

function nextStatus(status, grade) {
  if (grade === 'again') return 1;
  if (grade === 'good') return Math.min(4, status + 1);
  if (grade === 'easy') return status >= 4 ? KNOWN : status + 1;
  return status;
}

// Highlights the studied word inside its context sentence.
function Context({ sentence, word }) {
  if (!sentence) return null;
  const i = sentence.toLowerCase().indexOf(word.toLowerCase());
  if (i < 0) return <p className="card-context">{sentence}</p>;
  return (
    <p className="card-context">
      {sentence.slice(0, i)}
      <mark>{sentence.slice(i, i + word.length)}</mark>
      {sentence.slice(i + word.length)}
    </p>
  );
}

export default function Review({ words, setWords }) {
  const due = useMemo(
    () =>
      Object.values(words)
        .filter((w) => isLearning(w) && isDue(w))
        .sort((a, b) => (a.srs?.due ?? 0) - (b.srs?.due ?? 0)),
    [words]
  );
  const [queue, setQueue] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const reviewedToday = Object.values(words).filter((w) => (w.srs?.last ?? 0) >= startOfToday()).length;

  const current = queue?.[0] ? words[queue[0]] : null;

  const grade = (g) => {
    const w = current;
    setWords((ws) => upsert(ws, w.key, { srs: schedule(w.srs, g.q), status: nextStatus(w.status, g.id) }));
    setQueue((q) => (g.id === 'again' ? [...q.slice(1), q[0]] : q.slice(1)));
    setRevealed(false);
  };

  useEffect(() => {
    if (!current) return;
    const onKey = (e) => {
      if (e.target.closest('input, textarea')) return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed) {
        const g = GRADES.find((x) => x.key === e.key);
        if (g) grade(g);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!queue) {
    return (
      <div className="page-wrap">
        <header className="view-head">
          <div>
            <h1>Review</h1>
            <p className="muted">Spaced repetition of the words you are learning, shown in the sentence you met them.</p>
          </div>
        </header>
        <div className="review-start card">
          <div className="big-number">{due.length}</div>
          <p>{due.length === 1 ? 'card is' : 'cards are'} due · {reviewedToday} reviewed today</p>
          <button className="btn primary" disabled={!due.length} onClick={() => setQueue(due.slice(0, 50).map((w) => w.key))}>
            Start review
          </button>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="page-wrap">
        <div className="review-start card">
          <div className="big-number">✓</div>
          <p>Session complete. Schön gemacht!</p>
          <button className="btn" onClick={() => setQueue(null)}>
            Back
          </button>
        </div>
      </div>
    );
  }

  const article = current.gender && current.lemma && /^\p{Lu}/u.test(current.lemma) ? ARTICLES[current.gender] : null;

  return (
    <div className="page-wrap">
      <div className="review-progress muted small">{queue.length} left</div>
      <div className="flashcard card">
        <div className="fc-word">
          {current.word}
          <button className="icon-btn" onClick={() => speak(current.word)} title="Listen">
            🔊
          </button>
        </div>
        <Context sentence={current.context} word={current.word} />
        {current.context && (
          <button className="link small" onClick={() => speak(current.context)}>
            🔊 sentence
          </button>
        )}

        {revealed ? (
          <div className="fc-answer">
            <div className="fc-meaning">{current.translation || <span className="muted">(no meaning saved)</span>}</div>
            {(article || (current.lemma && current.lemma.toLowerCase() !== current.key)) && (
              <div className="muted">
                {article} {current.lemma}
              </div>
            )}
            {current.note && <div className="fc-note">{current.note}</div>}
            <div className="grades">
              {GRADES.map((g) => (
                <button key={g.id} className={`grade ${g.id}`} onClick={() => grade(g)}>
                  <b>{g.label}</b>
                  <span>{describeDelay(current.srs, g.q)}</span>
                  <kbd>{g.key}</kbd>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button className="btn primary reveal" onClick={() => setRevealed(true)}>
            Show meaning <kbd>Space</kbd>
          </button>
        )}
      </div>
    </div>
  );
}
