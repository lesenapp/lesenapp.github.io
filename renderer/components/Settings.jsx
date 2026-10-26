import { useEffect, useState } from 'react';
import { germanVoice, speak } from '../lib/speech.js';

export default function Settings({ settings, setSettings, profile }) {
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const [voice, setVoice] = useState(() => germanVoice());

  useEffect(() => {
    const update = () => setVoice(germanVoice());
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);

  return (
    <div className="page-wrap narrow">
      <header className="view-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">For {profile.name}</p>
        </div>
      </header>

      <section className="card settings">
        <div className="setting">
          <div>
            <b>Theme</b>
          </div>
          <div className="seg">
            {['system', 'light', 'dark'].map((t) => (
              <button key={t} className={settings.theme === t ? 'on' : ''} onClick={() => set({ theme: t })}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="setting">
          <div>
            <b>Reading text size</b>
            <p className="muted small">{settings.fontSize}px</p>
          </div>
          <input type="range" min="15" max="32" value={settings.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} />
        </div>

        <div className="setting">
          <div>
            <b>Words per page</b>
            <p className="muted small">{settings.wordsPerPage}</p>
          </div>
          <input
            type="range"
            min="100"
            max="800"
            step="50"
            value={settings.wordsPerPage}
            onChange={(e) => set({ wordsPerPage: Number(e.target.value) })}
          />
        </div>

        <div className="setting">
          <div>
            <b>Save words when I look them up</b>
            <p className="muted small">A word you click while reading is saved to My words with its first meaning.</p>
          </div>
          <input type="checkbox" checked={settings.autoSave} onChange={(e) => set({ autoSave: e.target.checked })} />
        </div>

        <div className="setting column">
          <div>
            <b>Anki deck</b>
            <p className="muted small">
              “Send to Anki” adds your saved words to this deck as two-way cards (German → English and English →
              German); sending again only adds new words and updates changed ones. Turn on FSRS once in Anki: Deck
              options → FSRS.{' '}
              {window.api.platform === 'web'
                ? 'On a computer, keep Anki open with the AnkiConnect add-on for one-click import; on phones the deck file opens in the Anki app.'
                : 'With the AnkiConnect add-on and Anki open, cards are imported directly and synced to AnkiWeb.'}
            </p>
          </div>
          <input
            className="input"
            value={settings.ankiDeck}
            placeholder="Lesen"
            onChange={(e) => set({ ankiDeck: e.target.value.replace(/["]/g, '') })}
          />
        </div>


        <div className="setting">
          <div>
            <b>German voice</b>
            <p className="muted small">
              {voice
                ? voice.name
                : window.api.platform === 'web'
                  ? 'No German voice found on this device. On phones it is usually available after tapping Test once; otherwise add a German voice in the system speech settings.'
                  : 'No German voice installed. Add one in Windows Settings → Time & language → Speech → Add voices → Deutsch.'}
            </p>
          </div>
          <button className="btn" onClick={() => speak('Guten Morgen! Wie geht es dir?')}>
            Test
          </button>
        </div>
      </section>
    </div>
  );
}
