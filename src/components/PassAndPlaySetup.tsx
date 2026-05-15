import { useState } from 'react';
import { goToPicker, startPassAndPlayMatch } from '../game/gameLoop';
import { previewInstrument } from '../audio/scheduler';
import {
  loadPassAndPlayDefaults,
  savePassAndPlayDefaults,
  type Instrument,
} from '../lib/storage';
import type { Difficulty } from '../patterns/types';
import type { PassAndPlayConfig } from '../game/stateMachine';

const INSTRUMENTS: Array<{ id: Instrument; label: string }> = [
  { id: 'drums', label: 'Drums' },
  { id: 'marimba', label: 'Marimba' },
  { id: 'kalimba', label: 'Kalimba' },
  { id: 'steelPan', label: 'Steel pan' },
  { id: 'piano', label: 'Piano' },
  { id: 'rhodes', label: 'Electric piano' },
  { id: 'bell', label: 'Bell' },
  { id: 'synth', label: 'Synth lead' },
  { id: 'bass', label: 'Synth bass' },
  { id: 'kazoo', label: 'Kazoo' },
  { id: 'bikeHorn', label: 'Bicycle horn' },
  { id: 'whoopee', label: 'Whoopee cushion' },
];

const DIFFICULTY_OPTIONS: Array<{ id: Difficulty | 'random'; label: string }> = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
  { id: 'random', label: 'Random' },
];

export function PassAndPlaySetup() {
  const defaults = loadPassAndPlayDefaults();
  const [p1Name, setP1Name] = useState(defaults.p1Name);
  const [p2Name, setP2Name] = useState(defaults.p2Name);
  const [p1Instrument, setP1Instrument] = useState<Instrument>(defaults.p1Instrument);
  const [p2Instrument, setP2Instrument] = useState<Instrument>(defaults.p2Instrument);
  const [difficulty, setDifficulty] = useState<Difficulty | 'random'>(defaults.difficulty);
  const [grooveSounds, setGrooveSounds] = useState(defaults.grooveSounds);

  const onStart = () => {
    const trimmedP1 = p1Name.trim();
    const trimmedP2 = p2Name.trim();
    // If exactly one player left their instrument as the persisted
    // default and the other picked one, the persisted one stays. If
    // both are at defaults, the user accepted them silently.
    const config: PassAndPlayConfig = {
      p1Name: trimmedP1 || 'Player 1',
      p2Name: trimmedP2 || 'Player 2',
      p1Instrument,
      p2Instrument,
      difficulty,
      grooveSounds,
    };
    savePassAndPlayDefaults({
      p1Name: trimmedP1,
      p2Name: trimmedP2,
      p1Instrument,
      p2Instrument,
      difficulty,
      grooveSounds,
    });
    void startPassAndPlayMatch(config);
  };

  return (
    <div className="screen screen--pp-setup">
      <h2 className="subtitle">Pass and Play</h2>
      <p className="tagline">Two players, one device. 10 rounds.</p>

      <div className="pp-setup">
        <section className="pp-setup__section">
          <h3 className="pp-setup__section-title">Difficulty</h3>
          <div className="pp-setup__difficulty-grid">
            {DIFFICULTY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`pp-setup__pill ${
                  difficulty === opt.id ? 'pp-setup__pill--on' : ''
                }`}
                onClick={() => setDifficulty(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {difficulty === 'random' && (
            <p className="pp-setup__hint">A fresh difficulty is rolled for each round.</p>
          )}
        </section>

        <section className="pp-setup__section">
          <h3 className="pp-setup__section-title">Players</h3>
          <PlayerRow
            label="Player 1"
            name={p1Name}
            onName={setP1Name}
            instrument={p1Instrument}
            onInstrument={(i) => {
              setP1Instrument(i);
              if (grooveSounds) void previewInstrument(i);
            }}
            instrumentDisabled={!grooveSounds}
          />
          <PlayerRow
            label="Player 2"
            name={p2Name}
            onName={setP2Name}
            instrument={p2Instrument}
            onInstrument={(i) => {
              setP2Instrument(i);
              if (grooveSounds) void previewInstrument(i);
            }}
            instrumentDisabled={!grooveSounds}
          />
        </section>

        <section className="pp-setup__section">
          <h3 className="pp-setup__section-title">Sound</h3>
          <button
            className={`setting-row ${grooveSounds ? 'setting-row--on' : ''}`}
            type="button"
            role="switch"
            aria-checked={grooveSounds}
            onClick={() => setGrooveSounds((v) => !v)}
          >
            <span className="setting-row__text">
              <span className="setting-row__label">Groove sounds</span>
              <span className="setting-row__hint">
                {grooveSounds
                  ? 'Each player hears their chosen instrument'
                  : 'Both players hear plain clicks'}
              </span>
            </span>
            <span className="setting-row__switch">
              <span className="setting-row__knob" />
            </span>
          </button>
        </section>
      </div>

      <div className="pp-setup__actions">
        <button className="btn btn--primary" type="button" onClick={onStart}>
          Start game
        </button>
        <button className="btn" type="button" onClick={goToPicker}>
          Cancel
        </button>
      </div>
    </div>
  );
}

interface PlayerRowProps {
  label: string;
  name: string;
  onName: (v: string) => void;
  instrument: Instrument;
  onInstrument: (i: Instrument) => void;
  instrumentDisabled: boolean;
}

function PlayerRow({
  label,
  name,
  onName,
  instrument,
  onInstrument,
  instrumentDisabled,
}: PlayerRowProps) {
  return (
    <div className="pp-setup__player">
      <span className="pp-setup__player-label">{label}</span>
      <input
        className="pp-setup__name-input"
        type="text"
        placeholder={`${label} (optional)`}
        value={name}
        onChange={(e) => onName(e.target.value)}
        maxLength={20}
      />
      <select
        className="setting-row__select"
        value={instrument}
        onChange={(e) => onInstrument(e.target.value as Instrument)}
        disabled={instrumentDisabled}
        aria-label={`${label} instrument`}
      >
        {INSTRUMENTS.map((inst) => (
          <option key={inst.id} value={inst.id}>
            {inst.label}
          </option>
        ))}
      </select>
    </div>
  );
}
