// Everything that differs between a German and an English profile. The app itself (reader,
// word panel, My words, Anki) works the same way for both.
const enc = encodeURIComponent;

const GERMAN = {
  code: 'de',
  name: 'Deutsch',
  // Stored collections: "texts", "words", … (unchanged from before English existed).
  prefix: '',
  ankiDeck: 'Lesen',
  speech: () => 'de-DE',
  google: (text) => `https://translate.google.com/?sl=de&tl=en&op=translate&text=${enc(text)}`,
  // Shown inside the word panel on every device.
  embed: { id: 'dwds', label: 'DWDS', url: (w) => `https://www.dwds.de/wb/${enc(w)}`, frame: true },
  wikis: [
    ['de', 'Deutsch'],
    ['en', 'English'],
  ],
  synonymsSource: 'Wiktionary, OpenThesaurus.de',
  links: [
    { name: 'Google Translate', url: (w) => `https://translate.google.com/?sl=de&tl=en&op=translate&text=${enc(w)}` },
    { name: 'Cambridge (German–English)', url: (w) => `https://dictionary.cambridge.org/dictionary/german-english/${enc(w)}` },
    { name: 'Collins (German–English)', url: (w) => `https://www.collinsdictionary.com/dictionary/german-english/${enc(w)}` },
    { name: 'Wiktionary', url: (w) => `https://en.wiktionary.org/wiki/${enc(w)}#German` },
    { name: 'DWDS (German, with corpus examples)', url: (w) => `https://www.dwds.de/wb/${enc(w)}` },
    { name: 'Duden', url: (w) => `https://www.duden.de/suchen/dudenonline/${enc(w)}` },
    { name: 'Linguee (in context)', url: (w) => `https://www.linguee.com/german-english/search?query=${enc(w)}` },
    { name: 'Reverso Context', url: (w) => `https://context.reverso.net/translation/german-english/${enc(w)}` },
    { name: 'dict.cc', url: (w) => `https://www.dict.cc/?s=${enc(w)}` },
    { name: 'Forvo (pronunciation)', url: (w) => `https://forvo.com/word/${enc(w)}/#de` },
  ],
  sources: [
    { name: 'nachrichtenleicht.de', note: 'A2', url: 'https://www.nachrichtenleicht.de' },
    { name: 'DW Top-Thema', note: 'B1', url: 'https://learngerman.dw.com/de/top-thema/s-55801700' },
    { name: 'Langsam gesprochene Nachrichten', note: 'B2', url: 'https://learngerman.dw.com/de/langsam-gesprochene-nachrichten/s-60040332' },
    { name: 'Projekt Gutenberg', note: 'books', url: 'https://www.projekt-gutenberg.org' },
  ],
  sample: {
    title: 'Ein Morgen in Berlin',
    content: `Es ist sieben Uhr morgens, und die Stadt wacht langsam auf. Anna steht am Fenster ihrer kleinen Wohnung und trinkt einen Kaffee. Draußen fährt die erste Straßenbahn vorbei.

Heute hat sie viel vor. Zuerst möchte sie auf den Markt gehen, um frisches Obst und Brot zu kaufen. Danach trifft sie ihren Bruder in einem Café am Kanal. Er ist gerade aus München zurückgekommen und will ihr von seiner Reise erzählen.

Der Himmel ist grau, aber Anna lässt sich die Laune nicht verderben. Sie nimmt ihren Regenschirm, zieht die Jacke an und geht die Treppe hinunter. Auf der Straße riecht es nach frischen Brötchen.`,
  },
};

// English: English–English learner dictionaries; translations go to Turkish.
const ENGLISH = {
  code: 'en',
  name: 'English',
  prefix: 'en-',
  ankiDeck: 'Lesen English',
  speech: (settings) => (settings.accent === 'us' ? 'en-US' : 'en-GB'),
  google: (text) => `https://translate.google.com/?sl=en&tl=tr&op=translate&text=${enc(text)}`,
  // Cambridge cannot be framed by websites; the desktop app shows it inside the panel, the
  // web app offers the big learner's dictionaries as buttons instead.
  embed: {
    id: 'cambridge',
    label: 'Cambridge',
    url: (w) => `https://dictionary.cambridge.org/search/direct/?datasetsearch=english&q=${enc(w)}`,
    frame: false,
  },
  wikis: [
    ['en', 'English'],
    ['simple', 'Simple English'],
  ],
  synonymsSource: 'Datamuse (WordNet), Wiktionary',
  links: [
    { name: 'Cambridge Dictionary', url: (w) => `https://dictionary.cambridge.org/search/direct/?datasetsearch=english&q=${enc(w)}` },
    { name: "Oxford Learner's Dictionaries", url: (w) => `https://www.oxfordlearnersdictionaries.com/search/english/?q=${enc(w)}` },
    { name: 'Longman (LDOCE)', url: (w) => `https://www.ldoceonline.com/search/english/direct/?q=${enc(w)}` },
    // Britannica keeps phrasal verbs on the verb's own page.
    { name: 'Britannica Dictionary', url: (w) => `https://www.britannica.com/dictionary/${enc(w.split(' ')[0])}` },
    { name: 'Merriam-Webster', url: (w) => `https://www.merriam-webster.com/dictionary/${enc(w)}` },
    { name: 'Collins English Dictionary', url: (w) => `https://www.collinsdictionary.com/search/?dictCode=english&q=${enc(w)}` },
    { name: 'Cambridge (English–Turkish)', url: (w) => `https://dictionary.cambridge.org/search/direct/?datasetsearch=english-turkish&q=${enc(w)}` },
    { name: 'Tureng (English–Turkish)', url: (w) => `https://tureng.com/en/turkish-english/${enc(w)}` },
    { name: 'Google Translate (→ Turkish)', url: (w) => `https://translate.google.com/?sl=en&tl=tr&op=translate&text=${enc(w)}` },
    { name: 'Reverso Context (in context)', url: (w) => `https://context.reverso.net/translation/english-turkish/${enc(w)}` },
    { name: 'YouGlish (hear it in videos)', url: (w) => `https://youglish.com/pronounce/${enc(w)}/english` },
    { name: 'Wiktionary', url: (w) => `https://en.wiktionary.org/wiki/${enc(w)}#English` },
    { name: 'Thesaurus.com', url: (w) => `https://www.thesaurus.com/browse/${enc(w)}` },
    { name: 'Etymonline (word origins)', url: (w) => `https://www.etymonline.com/search?q=${enc(w)}` },
  ],
  sources: [
    { name: 'News in Levels', note: 'A1–B1', url: 'https://www.newsinlevels.com' },
    { name: 'Breaking News English', note: 'A1–C1', url: 'https://breakingnewsenglish.com' },
    { name: 'VOA Learning English', note: 'B1', url: 'https://learningenglish.voanews.com' },
    { name: 'BBC Learning English', note: 'B1–C1', url: 'https://www.bbc.co.uk/learningenglish' },
    { name: 'Simple English Wikipedia', note: 'B1', url: 'https://simple.wikipedia.org' },
    { name: 'Project Gutenberg', note: 'books', url: 'https://www.gutenberg.org/ebooks/search/?sort_order=downloads' },
  ],
  sample: {
    title: 'A Morning in London',
    content: `It is seven o'clock in the morning, and the city is slowly waking up. Emma is standing at the window of her small flat, drinking a cup of tea. Outside, the first red bus goes past.

She has a lot to do today. First she wants to go to the market to buy some fresh fruit and bread. After that she is meeting her brother at a café by the river. He has just come back from Edinburgh and wants to tell her about his trip.

The sky is grey, but Emma doesn't let it spoil her mood. She picks up her umbrella, puts her coat on and goes down the stairs. Out in the street, it smells of fresh bread.`,
  },
};

export const LANGUAGES = { de: GERMAN, en: ENGLISH };
export const languageOf = (code) => LANGUAGES[code] ?? GERMAN;
