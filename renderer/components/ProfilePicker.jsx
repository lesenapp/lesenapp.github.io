import { useState } from 'react';

const COLORS = ['#c2410c', '#0f766e', '#7c3aed', '#be185d', '#1d4ed8', '#4d7c0f'];

export default function ProfilePicker({ profiles, onPick, onChange }) {
  const [name, setName] = useState('');

  const add = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const profile = { id: crypto.randomUUID(), name: trimmed, color: COLORS[profiles.length % COLORS.length] };
    onChange([...profiles, profile]);
    setName('');
  };

  return (
    <div className="picker">
      <div className="picker-card">
        <div className="brand big">
          Lesen<span>.</span>
        </div>
        <p className="muted">Learn German by reading. Who's reading today?</p>
        <div className="profiles">
          {profiles.map((p) => (
            <button key={p.id} className="profile-tile" onClick={() => onPick(p)}>
              <span className="avatar large" style={{ background: p.color }}>
                {p.name[0]?.toUpperCase()}
              </span>
              {p.name}
            </button>
          ))}
        </div>
        <form className="row" onSubmit={add}>
          <input
            className="input"
            placeholder={profiles.length ? 'Add another profile…' : 'Your name'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button className="btn primary" disabled={!name.trim()}>
            Add profile
          </button>
        </form>
      </div>
    </div>
  );
}
