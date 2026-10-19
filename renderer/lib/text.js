const WORD_RE = /[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu;
const NUMBER_RE = /^[\p{N}.,'’\-]+$/u;

export const wordKey = (s) => s.toLowerCase().replace(/’/g, "'").trim();

// Text -> paragraphs -> word / gap tokens. Each word token keeps its offset so the
// surrounding sentence can be recovered for context and flashcards.
export function tokenize(content) {
  return content
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((text) => {
      const tokens = [];
      let last = 0;
      for (const m of text.matchAll(WORD_RE)) {
        if (NUMBER_RE.test(m[0])) continue;
        if (m.index > last) tokens.push({ type: 'gap', text: text.slice(last, m.index) });
        tokens.push({ type: 'word', text: m[0], key: wordKey(m[0]), start: m.index });
        last = m.index + m[0].length;
      }
      if (last < text.length) tokens.push({ type: 'gap', text: text.slice(last) });
      return { text, tokens };
    });
}

export function paginate(paragraphs, wordsPerPage) {
  const pages = [];
  let current = [];
  let count = 0;
  paragraphs.forEach((p, i) => {
    const n = p.tokens.filter((t) => t.type === 'word').length;
    if (current.length && count + n > wordsPerPage) {
      pages.push(current);
      current = [];
      count = 0;
    }
    current.push(i);
    count += n;
  });
  if (current.length) pages.push(current);
  return pages.length ? pages : [[]];
}

export function sentenceAround(text, start, end) {
  const before = text.slice(0, start);
  const cut = Math.max(...['. ', '! ', '? ', '… ', ': '].map((s) => before.lastIndexOf(s)));
  const from = cut < 0 ? 0 : cut + 2;
  const tail = text.slice(end).search(/[.!?…](\s|$)/);
  const to = tail < 0 ? text.length : end + tail + 1;
  return text.slice(from, to).trim();
}

export function countWords(content) {
  return (content.match(WORD_RE) || []).filter((w) => !NUMBER_RE.test(w)).length;
}

export function uniqueWordKeys(content) {
  return new Set((content.match(WORD_RE) || []).filter((w) => !NUMBER_RE.test(w)).map(wordKey));
}
