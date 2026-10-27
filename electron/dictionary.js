// Desktop side of the shared dictionary (../shared/dictionary.mjs): requests go through
// Chromium's network stack (net.fetch, standard browser User-Agent that Wikimedia accepts)
// and results are cached in a JSON file.
const { app, net } = require('electron');
const fs = require('fs');
const path = require('path');

let cache = null;
let dirty = false;
let timer = null;
let dictionary = null;

const cacheFile = () => path.join(app.getPath('userData'), 'data', 'lookup-cache.json');

function getCache() {
  if (!cache) {
    try {
      cache = JSON.parse(fs.readFileSync(cacheFile(), 'utf8'));
    } catch {
      cache = {};
    }
  }
  return cache;
}

function flush() {
  clearTimeout(timer);
  if (!dirty) return;
  fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
  fs.writeFileSync(cacheFile(), JSON.stringify(cache));
  dirty = false;
}

async function getDictionary() {
  if (!dictionary) {
    const { createDictionary } = await import('../shared/dictionary.mjs');
    dictionary = createDictionary({
      fetch: (url, init) => net.fetch(url, init),
      cache: {
        get: (key) => getCache()[key],
        set: (key, value) => {
          getCache()[key] = value;
          dirty = true;
          clearTimeout(timer);
          timer = setTimeout(flush, 2000);
        },
      },
    });
  }
  return dictionary;
}

module.exports = {
  lookup: async (word) => (await getDictionary()).lookup(word),
  wikipedia: async (query, lang) => (await getDictionary()).wikipedia(query, lang),
  translate: async (text) => (await getDictionary()).translate(text),
  inflection: async (word) => (await getDictionary()).inflection(word),
  flush,
};
