// Plain JSON files under %APPDATA%\Lesen\data, one folder per profile.
// Writes are debounced and flushed on quit; the previous version is kept as .bak.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

// Each collection, and its English-profile twin ("en-texts" …).
const BASE_COLLECTIONS = ['texts', 'words', 'settings', 'stats'];
const COLLECTIONS = new Set([...BASE_COLLECTIONS, ...BASE_COLLECTIONS.map((n) => `en-${n}`)]);
const pending = new Map();
let timer = null;

const root = () => path.join(app.getPath('userData'), 'data');

function dataFile(profileId, name) {
  if (!/^[A-Za-z0-9-]+$/.test(profileId)) throw new Error('Invalid profile id');
  if (!COLLECTIONS.has(name)) throw new Error('Unknown collection');
  return path.join(root(), 'profiles', profileId, `${name}.json`);
}

function read(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    try {
      return JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'));
    } catch {
      return fallback;
    }
  }
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  fs.renameSync(tmp, file);
}

function flush() {
  clearTimeout(timer);
  for (const [file, value] of pending) write(file, value);
  pending.clear();
}

module.exports = {
  listProfiles: () => read(path.join(root(), 'profiles.json'), []),
  saveProfiles: (list) => write(path.join(root(), 'profiles.json'), list),
  load(profileId, name) {
    const file = dataFile(profileId, name);
    return pending.has(file) ? pending.get(file) : read(file, null);
  },
  save(profileId, name, value) {
    pending.set(dataFile(profileId, name), value);
    clearTimeout(timer);
    timer = setTimeout(flush, 300);
  },
  flush,
};
