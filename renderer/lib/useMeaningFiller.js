import { useEffect, useRef, useState } from 'react';
import { firstGloss } from './words.js';

// Quietly completes saved words in the background, one lookup at a time: a missing meaning,
// and the base form + gender (for the article) of words saved before they were looked up.
export function useMeaningFiller(words, setWords, settings) {
  const busy = useRef(false);
  const tried = useRef(new Set());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!words || busy.current) return;
    const todo = Object.values(words).find(
      (w) =>
        !tried.current.has(w.key) &&
        (!w.translation?.trim() || (!w.isPhrase && !w.looked))
    );
    if (!todo) return;
    busy.current = true;
    tried.current.add(todo.key);

    const fill = (patch) =>
      setWords((ws) => {
        const cur = ws[todo.key];
        if (!cur) return ws;
        const translation = cur.translation?.trim() ? cur.translation : patch.translation || cur.translation;
        return { ...ws, [todo.key]: { ...cur, ...patch, translation } };
      });

    (async () => {
      try {
        if (todo.isPhrase) {
          const t = await window.api.translate(todo.word, { googleKey: settings.googleKey, deeplKey: settings.deeplKey });
          if (t?.text) fill({ translation: t.text });
        } else {
          const d = await window.api.lookup(todo.word);
          if (d?.found) fill({ translation: firstGloss(d), lemma: d.lemma, gender: d.gender, looked: true });
        }
      } finally {
        busy.current = false;
        setTick((n) => n + 1);
      }
    })();
  }, [words, setWords, settings.googleKey, settings.deeplKey, tick]);
}
