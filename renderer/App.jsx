import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePersisted } from './lib/usePersisted.js';
import { useMeaningFiller } from './lib/useMeaningFiller.js';
import { useBackButton } from './lib/useBackButton.js';
import { isLegacyUnsaved } from './lib/words.js';
import { pendingForAnki } from './lib/anki.js';
import { loadPlace, savePlace } from './lib/lastPlace.js';
import { readingSummary, recordReading } from './lib/stats.js';
import { languageOf } from './lib/language.js';
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
  ankiDeck: 'Lesen',
  genderColors: true,
  speechRate: 0.9,
  accent: 'uk',
};

// Settings of a new profile in a language (its own Anki deck).
const defaultsFor = (lang) => ({ ...DEFAULT_SETTINGS, ankiDeck: languageOf(lang).ankiDeck });

const VIEWS = ['library', 'reader', 'vocabulary', 'settings'];

export default function App() {
  const [profiles, setProfiles] = useState(null);
  const [active, setActive] = useState(null);
  const [lang, setLang] = useState(() => languageOf(loadPlace().lang).code);

  useEffect(() => {
    window.api.listProfiles().then((list) => {
      setProfiles(list);
      const last = list.find((p) => p.id === loadPlace().profileId);
      if (last) setActive(last);
    });
  }, []);

  if (!profiles) return null;
  if (!active) {
    return (
      <ProfilePicker
        profiles={profiles}
        lang={lang}
        onLang={(l) => {
          setLang(l);
          savePlace({ lang: l });
        }}
        onPick={(p) => {
          savePlace({ profileId: p.id, lang });
          setActive(p);
        }}
        onChange={(list) => {
          setProfiles(list);
          window.api.saveProfiles(list);
        }}
      />
    );
  }
  return (
    <Workspace
      key={`${active.id}:${lang}`}
      profile={active}
      lang={lang}
      onSwitch={() => {
        savePlace({ lang });
        setActive(null);
      }}
    />
  );
}

const NAV = [
  { id: 'library', label: 'Library', icon: '▤' },
  { id: 'reader', label: 'Reader', icon: '❦' },
  { id: 'vocabulary', label: 'My words', icon: '★' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

function Workspace({ profile, lang, onSwitch }) {
  // German data keeps its original names; English lives next to it as "en-texts", ….
  const { prefix } = languageOf(lang);
  const [texts, setTexts] = usePersisted(profile.id, prefix + 'texts', []);
  const [words, setWords] = usePersisted(profile.id, prefix + 'words', {});
  const [storedSettings, setSettings] = usePersisted(profile.id, prefix + 'settings', defaultsFor(lang));
  const [reading, setReading] = usePersisted(profile.id, prefix + 'stats', {});
  const [place] = useState(loadPlace);
  const [view, setView] = useState(() => (VIEWS.includes(place.view) ? place.view : 'library'));
  const [openTextId, setOpenTextId] = useState(place.textId ?? null);

  useEffect(() => savePlace({ profileId: profile.id, lang, view, textId: openTextId }), [profile.id, lang, view, openTextId]);

  const settings = useMemo(() => ({ ...defaultsFor(lang), ...storedSettings }), [storedSettings, lang]);
  useMeaningFiller(words, setWords, lang);
  useBackButton(view !== 'library', () => setView('library'));

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

  if (!texts || !words || !storedSettings || !reading) return <div className="loading">Loading…</div>;

  const openText = texts.find((t) => t.id === openTextId);
  // A reload into a text that no longer exists lands in the Library.
  const current = view === 'reader' && !openText ? 'library' : view;
  const open = (id) => {
    setOpenTextId(id);
    setView('reader');
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          Lesen<span>.</span>
          <span className="brand-lang">{languageOf(lang).name}</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${current === n.id ? 'active' : ''}`}
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
        {current === 'library' && (
          <Library lang={lang} texts={texts} setTexts={setTexts} words={words} reading={readingSummary(reading)} onOpen={open} />
        )}
        {current === 'reader' && (
          <Reader
            key={openText.id}
            text={openText}
            lang={lang}
            words={words}
            setWords={setWords}
            settings={settings}
            onUpdateText={(patch) => updateText(openText.id, patch)}
            onRead={(key, count) => setReading((r) => recordReading(r, key, count))}
            onBack={() => setView('library')}
          />
        )}
        {view === 'vocabulary' && (
          <Vocabulary lang={lang} words={words} setWords={setWords} texts={texts} settings={settings} onOpen={open} />
        )}
        {view === 'settings' && (
          <Settings lang={lang} settings={settings} setSettings={setSettings} profile={profile} />
        )}
      </main>
    </div>
  );
}
