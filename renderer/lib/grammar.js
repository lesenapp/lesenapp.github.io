import { resolveGender } from './genderResolve.js';

// ---------- Separable verbs ----------

// Prefixes that split off and go to the end of the clause: "Ich rufe dich morgen an."
const PARTICLES = new Set(
  'ab an auf aus bei dar ein empor fern fest fort frei heim her herab heran herauf heraus herein herum herunter hervor hin hinab hinauf hinaus hinein hinter hinunter hinzu kennen los mit nach nieder vor voran voraus vorbei vorher vorüber weg weiter wieder zu zurecht zurück zusammen bereit statt teil hoch um durch über unter entgegen gegenüber auseinander'.split(' ')
);

// Words that start a new clause even without a comma ("…zieht die Jacke an und geht…").
const CLAUSE_START = new Set('und oder aber denn sondern sowie dass weil wenn ob obwohl damit bevor nachdem sobald falls'.split(' '));

// For the word at token index `ti`: the particle closing its clause, if any.
// "Ich rufe dich morgen an." → clicking "rufe" gives "an".
export function separableParticle(tokens, ti) {
  const word = tokens[ti];
  if (PARTICLES.has(word.key)) return null;
  let last = null;
  for (let i = ti + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'gap') {
      if (/[.,;:!?…()"“”„«»–—]/.test(t.text)) break;
      continue;
    }
    if (CLAUSE_START.has(t.key)) break;
    last = t;
  }
  return last && PARTICLES.has(last.key) && last.text === last.key ? last.key : null;
}

// ---------- English phrasal verbs ----------

// Adverb particles: right after the verb or after a short object ("pick it up",
// "put your coat on" is handled by the strong list only when it is clause-final).
const EN_STRONG = new Set('up down out off away back over around round apart aside together forward'.split(' '));
// Particles that are just as often ordinary prepositions ("look after" vs "after lunch"):
// only right after the verb, and only offered as a suggestion.
const EN_WEAK = new Set('on in at by for to after into across about through along onto upon with without'.split(' '));
const EN_CLAUSE_START = new Set(
  'and or but so because that which who whom whose when where while if although though unless until before after since'.split(' ')
);
const EN_NOT_VERBS = new Set(
  'i you he she it we they me him her us them my your his its our their the a an this that these those to of and or but'.split(' ')
);

// For the word at `ti`: { particle, weak } when a particle that may form a phrasal verb
// follows it in the same clause. "She picks up her umbrella" / "picks it up" → up;
// "puts her coat on." → on (clause-final); "looks after him" → after (weak).
export function phrasalParticle(tokens, ti) {
  const word = tokens[ti];
  if (EN_STRONG.has(word.key) || EN_WEAK.has(word.key) || EN_NOT_VERBS.has(word.key)) return null;
  const following = [];
  let clauseEnd = false;
  for (let i = ti + 1; i < tokens.length && following.length < 4; i++) {
    const t = tokens[i];
    if (t.type === 'gap') {
      if (/[.,;:!?…()"“”«»–—]/.test(t.text)) {
        clauseEnd = true;
        break;
      }
      continue;
    }
    if (EN_CLAUSE_START.has(t.key) && following.length) {
      clauseEnd = true;
      break;
    }
    following.push(t);
  }
  if (!following.length) return null;
  const [next] = following;
  if (EN_STRONG.has(next.key)) return { particle: next.key, weak: false };
  if (EN_WEAK.has(next.key)) return { particle: next.key, weak: true };
  // Split: "pick it up", "turn the radio off", "put her coat on." (on only clause-final).
  const within = following.slice(1, 3);
  const strong = within.find((t) => EN_STRONG.has(t.key));
  if (strong) return { particle: strong.key, weak: false };
  const last = following[following.length - 1];
  if (clauseEnd && following.length <= 3 && EN_WEAK.has(last.key)) return { particle: last.key, weak: false };
  return null;
}

// ---------- Prepositions ----------

const CASES = {
  Akkusativ: 'bis durch entlang für gegen ohne um wider',
  Dativ: 'ab aus außer bei gegenüber mit nach seit von zu beim vom zum zur',
  Genitiv: 'außerhalb innerhalb statt anstatt trotz während wegen aufgrund oberhalb unterhalb diesseits jenseits laut mithilfe',
  'Akkusativ / Dativ': 'an auf hinter in neben über unter vor zwischen am im ans ins aufs',
};

const PREPOSITIONS = new Map(
  Object.entries(CASES).flatMap(([c, list]) => list.split(' ').map((p) => [p, c]))
);

// "mit" → "Dativ"; two-way prepositions → "Akkusativ / Dativ".
export const prepositionCase = (word) => PREPOSITIONS.get(word.toLowerCase()) ?? null;

// ---------- Noun genders ----------

// Never coloured: function words that can also be nouns (das Ich, das Aber), and names and
// places that share their spelling with a rare noun (Anna, Paris).
const NOT_NOUNS = new Set(
  `Ich Du Er Sie Es Wir Ihr Man Der Die Das Den Dem Des Ein Eine Einer Einen Einem Eines Dies Diese Dieser Dieses
  Mein Dein Sein Unser Euer Was Wer Wie Wo Warum Wann Dann Da Hier Jetzt So Auch Noch Nur Schon Doch Aber Und
  Oder Wenn Weil Ob Ja Nein Nichts Alles Etwas Heute Gestern Selbst Bitte Danke Hallo
  Anna Ada Anke Eva Marie Maria Marina Erika Iris Rosa Flora Gloria Viola Charlotte Clementine Franziska Vanessa
  Esther Christin Minna Lulu Nanny Kiki Mara Lore Benjamin Johannes Hans Fritz Klaus Hugo Axel August Ernst
  Hermann Horst Dirk Henry Willi Tommy Iwan Noah Pascal Lutz Matz Alf Kai Dino Milan Bertram Dietrich Nikolaus
  Paris Rom China Kongo Tibet Genua Kiel Konstanz Boston Oxford Manchester Kamerun Madeira Bordeaux Havanna Mekka
  Memphis Omaha Ceylon Guinea Alabama Delaware Hokkaido Erlangen Gießen Münster Halle Hamm Baden Posen Split`.split(/\s+/)
);

let genders = null;
let loading = null;

// The noun list (~190 kB) is loaded on first use only.
export function loadGenders() {
  loading ??= import('./genders-data.js').then(({ default: data }) => {
    const map = new Map();
    for (const [g, list] of Object.entries(data)) for (const w of list.split(' ')) map.set(w, g);
    genders = map;
    return map;
  });
  return loading;
}

// Gender ('m' | 'f' | 'n') of a capitalised word in running text, or null. Sentence-initial
// words are capitalised anyway, so they only count when the exact form is a known noun.
export function nounGender(word, sentenceStart) {
  if (!genders || !/^\p{Lu}[\p{Ll}ß]+$/u.test(word) || NOT_NOUNS.has(word)) return null;
  const g = resolveGender(genders, word, sentenceStart);
  return g === 'x' ? null : g;
}
