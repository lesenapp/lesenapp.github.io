// Anki export. Words are packed into an .apkg (Anki's own package format) with a fixed note
// type and one stable GUID per word, so sending again only adds new words and updates
// changed ones — never duplicates. On a computer with Anki + AnkiConnect the package is
// imported directly and AnkiWeb sync is triggered; on phones it goes to Anki via the share sheet.
import { strToU8, zipSync } from 'fflate';
import { headword } from './words.js';

const MODEL_ID = 1729411200000; // fixed: every export targets the same note type
const MODEL_NAME = 'Lesen (German ↔ English)';
const FIELDS = ['Word', 'Meaning', 'Context', 'Note'];

const CSS = `.card { font-family: Georgia, 'Times New Roman', serif; font-size: 22px; text-align: center; color: #24211c; background: #fbfaf7; padding: 24px 16px; }
.nightMode.card, .night_mode .card { color: #ebe7df; background: #1c1b20; }
.word { font-size: 34px; font-weight: bold; }
.meaning { font-size: 26px; }
.ctx { margin-top: 18px; font-size: 18px; font-style: italic; opacity: .8; }
.ctx b { font-style: normal; background: rgba(245, 190, 30, .35); border-radius: 4px; padding: 0 3px; }
.note { margin-top: 14px; font-size: 16px; opacity: .7; white-space: pre-wrap; }
hr#answer { margin: 22px 0; border: 0; border-top: 1px solid rgba(128, 128, 128, .35); }`;

const CONTEXT = '{{#Context}}<div class="ctx">{{Context}}</div>{{/Context}}';
const NOTE = '{{#Note}}<div class="note">{{Note}}</div>{{/Note}}';
const TEMPLATES = [
  {
    name: 'German → English',
    qfmt: `<div class="word">{{Word}}</div>${CONTEXT}`,
    afmt: `{{FrontSide}}<hr id="answer"><div class="meaning">{{Meaning}}</div>${NOTE}`,
  },
  {
    name: 'English → German',
    qfmt: '<div class="meaning">{{Meaning}}</div>',
    afmt: `{{FrontSide}}<hr id="answer"><div class="word">{{Word}}</div>${CONTEXT}${NOTE}`,
  },
];

const SCHEMA = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);`;

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function contextHtml(sentence, word) {
  const safe = escapeHtml(sentence);
  if (!word) return safe;
  const i = safe.toLowerCase().indexOf(escapeHtml(word).toLowerCase());
  if (i < 0) return safe;
  const len = escapeHtml(word).length;
  return `${safe.slice(0, i)}<b>${safe.slice(i, i + len)}</b>${safe.slice(i + len)}`;
}

// The four Anki fields for a saved word; also used to detect changes since the last export.
export function ankiFields(w) {
  return [
    escapeHtml(headword(w)),
    escapeHtml(w.translation),
    contextHtml(w.context, w.word),
    escapeHtml(w.note).replace(/\n/g, '<br>'),
  ];
}

const signature = (w) => ankiFields(w).join('\u001f');

// Saved words with a meaning that Anki does not have yet (or has an older version of).
export function pendingForAnki(words) {
  return Object.values(words).filter((w) => w.translation?.trim() && w.ankiSig !== signature(w));
}

// Stored on a word once a given version of it has been sent.
export const sentStamp = (sentVersion) => ({ ankiSig: signature(sentVersion), ankiAt: Date.now() });

async function sha1Hex(text) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function deckIdFor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 1_000_000;
  return 1729411200000 + h + 1;
}

// SQLite (sql.js) is loaded only when a package is built. The wasm is inlined because the
// desktop app runs from file://, where fetching a separate .wasm file is not allowed.
async function loadSqlite() {
  const [{ default: initSqlJs }, { default: wasmBase64 }] = await Promise.all([
    import('sql.js'),
    import('virtual:sql-wasm'),
  ]);
  const wasmBinary = Uint8Array.from(atob(wasmBase64), (c) => c.charCodeAt(0));
  return initSqlJs({ wasmBinary });
}

export async function buildApkg(list, deckName) {
  const SQL = await loadSqlite();
  const db = new SQL.Database();
  db.run(SCHEMA);

  const now = Date.now();
  const secs = Math.floor(now / 1000);
  const deckId = deckIdFor(deckName);
  const deck = (id, name) => ({
    id,
    name,
    desc: '',
    dyn: 0,
    conf: 1,
    collapsed: false,
    extendNew: 10,
    extendRev: 50,
    usn: -1,
    mod: secs,
    newToday: [0, 0],
    revToday: [0, 0],
    lrnToday: [0, 0],
    timeToday: [0, 0],
  });
  const model = {
    id: MODEL_ID,
    name: MODEL_NAME,
    type: 0,
    mod: secs,
    usn: -1,
    sortf: 0,
    did: deckId,
    tmpls: TEMPLATES.map((t, ord) => ({ ...t, ord, did: null, bqfmt: '', bafmt: '' })),
    flds: FIELDS.map((name, ord) => ({ name, ord, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] })),
    css: CSS,
    latexPre:
      '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
    latexPost: '\\end{document}',
    req: [
      [0, 'any', [0]],
      [1, 'any', [1]],
    ],
    tags: [],
    vers: [],
  };
  const dconf = {
    id: 1,
    name: 'Default',
    autoplay: true,
    dyn: false,
    maxTaken: 60,
    mod: 0,
    usn: 0,
    replayq: true,
    timer: 0,
    new: { bury: true, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20, separate: true },
    lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 },
    rev: { bury: true, ease4: 1.3, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, minSpace: 1, perDay: 200 },
  };
  const conf = {
    activeDecks: [1],
    curDeck: 1,
    newSpread: 0,
    collapseTime: 1200,
    timeLim: 0,
    estTimes: true,
    dueCounts: true,
    curModel: null,
    nextPos: 1,
    sortType: 'noteFld',
    sortBackwards: false,
    addToCur: true,
  };
  db.run('INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, ?)', [
    secs,
    now,
    now,
    JSON.stringify(conf),
    JSON.stringify({ [MODEL_ID]: model }),
    JSON.stringify({ 1: deck(1, 'Default'), [deckId]: deck(deckId, deckName) }),
    JSON.stringify({ 1: dconf }),
    '{}',
  ]);

  const used = new Set();
  let position = 0;
  for (const w of list) {
    let nid = w.created || now;
    while (used.has(nid)) nid++;
    used.add(nid);
    const fields = ankiFields(w);
    const sortField = fields[0].replace(/<[^>]+>/g, '');
    const csum = parseInt((await sha1Hex(sortField)).slice(0, 8), 16);
    const guid = `lesen-${(await sha1Hex(w.key)).slice(0, 16)}`;
    const mod = Math.floor((w.updated || now) / 1000);
    db.run('INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, ?)', [
      nid,
      guid,
      MODEL_ID,
      mod,
      ' lesen ',
      fields.join('\u001f'),
      sortField,
      csum,
      '',
    ]);
    position++;
    for (let ord = 0; ord < TEMPLATES.length; ord++) {
      db.run('INSERT INTO cards VALUES (?, ?, ?, ?, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)', [
        nid * 2 + ord,
        nid,
        deckId,
        ord,
        mod,
        position,
        '',
      ]);
    }
  }

  const collection = db.export();
  db.close();
  return zipSync({ 'collection.anki2': collection, media: strToU8('{}') });
}

// ---------- delivery ----------

async function ankiConnect(action, params = {}) {
  const res = await window.api.ankiConnect({ action, version: 6, params });
  if (res?.error) throw new Error(res.error);
  return res?.result;
}

// 'ready' (Anki open, this app allowed), 'forbidden' (Anki open, this site not allowed yet)
// or 'offline' (Anki closed / AnkiConnect missing / phone).
export async function ankiConnectStatus() {
  try {
    return (await ankiConnect('version')) >= 6 ? 'ready' : 'offline';
  } catch (e) {
    return e.message === 'forbidden' ? 'forbidden' : 'offline';
  }
}

// Shows AnkiConnect's "allow this website?" dialog inside Anki; resolves once answered.
export async function requestAnkiPermission() {
  try {
    return (await ankiConnect('requestPermission'))?.permission === 'granted';
  } catch {
    return false;
  }
}

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const FILE_NAME = '_lesen_import.apkg';

// Computer with Anki running + AnkiConnect: import silently, then sync to AnkiWeb (and so to
// phones). Returns whether the AnkiWeb sync succeeded (it fails when not logged in).
export async function importViaAnkiConnect(bytes) {
  await ankiConnect('storeMediaFile', { filename: FILE_NAME, data: toBase64(bytes) });
  const dir = await ankiConnect('getMediaDirPath');
  await ankiConnect('importPackage', { path: `${dir}/${FILE_NAME}` });
  await ankiConnect('deleteMediaFile', { filename: FILE_NAME }).catch(() => {});
  return ankiConnect('sync').then(
    () => true,
    () => false
  );
}

// Everywhere else: hand the package to Anki. Phones only allow the share sheet right after a
// tap, so call this with an already-built package and without awaiting anything first.
// Returns 'opened', 'shared' or 'downloaded'.
export async function deliverPackage(bytes) {
  const name = `Lesen ${new Date().toISOString().slice(0, 10)}.apkg`;
  if (window.api.openAnkiPackage) {
    await window.api.openAnkiPackage(bytes, name);
    return 'opened';
  }
  const file = new File([bytes], name, { type: 'application/octet-stream' });
  // iPhone shares the file straight to Anki; browsers that refuse .apkg files fall back to a download.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') throw e;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return 'downloaded';
}
