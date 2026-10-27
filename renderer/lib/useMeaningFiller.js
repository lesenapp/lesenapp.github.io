import { useEffect, useRef, useState } from 'react';
import { LOOKUP_VERSION, firstGloss, lookupFields, lookupWord } from './words.js';

const needsMeaning = (w) => !w.translation?.trim();
const needsLookup = (w) => !w.isPhrase && w.looked !== LOOKUP_VERSION;
const needsContext = (w) => Boolean(w.context) && !w.contextTranslation;

// Quietly completes saved words in the background, one word at a time: a missing meaning,
// the dictionary form (base form, gender, plural) and the English translation of the
// sentence the word came from — everything the Anki card shows.
export function useMeaningFiller(words, setWords) {
  const busy = useRef(false);
  const tried = useRef(new Set());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!words || busy.current) return;
    const todo = Object.values(words).find(
      (w) => !tried.current.has(w.key) && (needsMeaning(w) || needsLookup(w) || needsContext(w))
    );
    if (!todo) return;
    busy.current = true;
    tried.current.add(todo.key);

    (async () => {
      const patch = {};
      try {
        if (todo.isPhrase && needsMeaning(todo)) {
          const t = await window.api.translate(todo.word);
          if (t?.text) patch.translation = t.text;
        }
        if (needsLookup(todo)) {
          const d = await lookupWord(todo.word, todo.particle);
          if (d?.found) Object.assign(patch, lookupFields(d), { translation: firstGloss(d) });
        }
        if (needsContext(todo)) {
          const t = await window.api.translate(todo.context);
          if (t?.text) patch.contextTranslation = t.text;
        }
      } finally {
        if (Object.keys(patch).length) {
          setWords((ws) => {
            const cur = ws[todo.key];
            if (!cur) return ws;
            const translation = cur.translation?.trim() ? cur.translation : patch.translation || cur.translation;
            return { ...ws, [todo.key]: { ...cur, ...patch, translation } };
          });
        }
        busy.current = false;
        setTick((n) => n + 1);
      }
    })();
  }, [words, setWords, tick]);
}
