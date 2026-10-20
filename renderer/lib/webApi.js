// Browser implementation of window.api (the desktop app gets it from electron/preload.js).
// Everything is stored on this device in IndexedDB; nothing leaves it except dictionary lookups.
import { createDictionary } from '../../shared/dictionary.mjs';

let dbPromise = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('lesen', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idb(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = fn(db.transaction('kv', mode).objectStore('kv'));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const get = (key) => idb('readonly', (s) => s.get(key));
const put = (key, value) => idb('readwrite', (s) => s.put(value, key));

// Saves are debounced and flushed when the app is hidden (phones kill background tabs).
const pending = new Map();
let timer = null;

function flush() {
  clearTimeout(timer);
  for (const [key, value] of pending) put(key, value);
  pending.clear();
}

function queue(key, value) {
  pending.set(key, value);
  clearTimeout(timer);
  timer = setTimeout(flush, 400);
}

const memo = new Map();
const dictionary = createDictionary({
  fetch: (url, init) => window.fetch(url, init),
  cache: {
    async get(key) {
      if (!memo.has(key)) memo.set(key, await get(`cache:${key}`));
      return memo.get(key);
    },
    set(key, value) {
      memo.set(key, value);
      put(`cache:${key}`, value);
    },
  },
});

export function installWebApi() {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  navigator.storage?.persist?.();

  window.api = {
    platform: 'web',
    listProfiles: async () => (await get('profiles')) ?? [],
    saveProfiles: (list) => put('profiles', list),
    load: async (profileId, name) => {
      const key = `profile:${profileId}:${name}`;
      return pending.has(key) ? pending.get(key) : (await get(key)) ?? null;
    },
    save: async (profileId, name, value) => queue(`profile:${profileId}:${name}`, value),
    lookup: (word) => dictionary.lookup(word),
    wikipedia: (query, lang) => dictionary.wikipedia(query, lang),
    translate: (text, keys) => dictionary.translate(text, { googleKey: keys?.googleKey }),
    // AnkiConnect (Anki desktop add-on) listens on this computer only; phones never reach it.
    ankiConnect: async (body) => {
      try {
        const res = await fetch('http://127.0.0.1:8765', {
          method: 'POST',
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(body.action === 'version' ? 1500 : 60_000),
        });
        return await res.json();
      } catch {
        return { result: null, error: 'Anki is not running or AnkiConnect is not installed' };
      }
    },
    openExternal: async (url) => {
      if (/^https:\/\//.test(url)) window.open(url, '_blank', 'noopener');
    },
  };
}
