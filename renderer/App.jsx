import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePersisted } from './lib/usePersisted.js';
import { useMeaningFiller } from './lib/useMeaningFiller.js';
import { isLegacyUnsaved } from './lib/words.js';
import { pendingForAnki } from './lib/anki.js';
import ProfilePicker from './components/ProfilePicker.jsx';
import Library from './components/Library.jsx';
import Reader from './components/Reader.jsx';
import Vocabulary from './components/Vocabulary.jsx';
import Settings from './components/Settings.jsx';

export const DEFAULT_SETTINGS = {
  theme: 'system',
  fontSize: 21,
  wordsPerPage: 250,
  autoSave: true,
  deeplKey: '',
  googleKey: '',
  ankiDeck: 'Lesen',
};

export default function App() {
  const [profiles, setProfiles] = useState(null);
  const [active, setActive] = useState(null);

  useEffect(() => {
    window.api.listProfiles().then(setProfiles);
  }, []);

  if (!profiles) return null;
  if (!active) {
    return (
      <ProfilePicker
        profiles={profiles}
        onPick={setActive}
        onChange={(list) => {
          setProfiles(list);
          window.api.saveProfiles(list);
        }}
      />
    );
  }
  return <Workspace key={active.id} profile={active} onSwitch={() => setActive(null)} />;
}

const NAV = [
  { id: 'library', label: 'Library', icon: '▤' },
  { id: 'reader', label: 'Reader', icon: '❦' },
  { id: 'vocabulary', label: 'My words', icon: '★' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

function Workspace({ profile, onSwitch }) {
  const [texts, setTexts] = usePersisted(profile.id, 'texts', []);
  const [words, setWords] = usePersisted(profile.id, 'words', {});
  const [storedSettings, setSettings] = usePersisted(profile.id, 'settings', DEFAULT_SETTINGS);
  const [view, setView] = useState('library');
  const [openTextId, setOpenTextId] = useState(null);

  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...storedSettings }), [storedSettings]);
  useMeaningFiller(words, setWords, settings);

  // Drop the "known"/"ignored" entries older versions created; they were never saved words.
  useEffect(() => {
    if (words && Object.values(words).some(isLegacyUnsaved)) {
      setWords((ws) => Object.fromEntries(Object.entries(ws).filter(([, w]) => !isLegacyUnsaved(w))));
    }
  }, [words, setWords]);

  useEffect(() => {
    const dark =
      settings.theme === 'dark' ||
      (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [settings.theme]);

  const updateText = useCallback(
    (id, patch) => setTexts((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t))),
    [setTexts]
  );

  const stats = useMemo(() => {
    return {
      saved: Object.keys(words || {}).length,
      forAnki: words ? pendingForAnki(words).length : 0,
    };
  }, [words]);

  if (!texts || !words || !storedSettings) return <div className="loading">Loading…</div>;

  const openText = texts.find((t) => t.id === openTextId);
  const open = (id) => {
    setOpenTextId(id);
    setView('reader');
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          Lesen<span>.</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id ? 'active' : ''}`}
              onClick={() => setView(n.id)}
              disabled={n.id === 'reader' && !openText}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
              {n.id === 'vocabulary' && stats.forAnki > 0 && (
                <span className="badge" title="Words waiting to be sent to Anki">
                  {stats.forAnki}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="side-stats">
          <div>
            <b>{stats.saved}</b> saved words
          </div>
        </div>
        <button className="profile-chip" onClick={onSwitch} title="Switch profile">
          <span className="avatar" style={{ background: profile.color }}>
            {profile.name[0]?.toUpperCase()}
          </span>
          <span className="profile-name">{profile.name}</span>
          <span className="muted">switch</span>
        </button>
      </aside>

      <main className="main">
        {view === 'library' && (
          <Library texts={texts} setTexts={setTexts} words={words} onOpen={open} />
        )}
        {view === 'reader' && openText && (
          <Reader
            key={openText.id}
            text={openText}
            words={words}
            setWords={setWords}
            settings={settings}
            onUpdateText={(patch) => updateText(openText.id, patch)}
            onBack={() => setView('library')}
          />
        )}
        {view === 'vocabulary' && (
          <Vocabulary words={words} setWords={setWords} texts={texts} settings={settings} onOpen={open} />
        )}
        {view === 'settings' && (
          <Settings settings={settings} setSettings={setSettings} profile={profile} />
        )}
      </main>
    </div>
  );
}
