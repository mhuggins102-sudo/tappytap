import { useEffect, useRef, useState } from 'react';
import { startRound, goToDailyScreen, goToArchiveScreen } from '../game/gameLoop';
import { previewInstrument } from '../audio/scheduler';
import {
  clearHighScores,
  loadHighScores,
  loadSettings,
  saveSettings,
  type HighScores,
  type Instrument,
} from '../lib/storage';

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
import { loadDailyEntry } from '../lib/storage';
import { todayUtcDateString } from '../patterns/daily';
import type { Difficulty } from '../patterns/types';

const LEVELS: Array<{ id: Difficulty; label: string; blurb: string }> = [
  { id: 'easy', label: 'Easy', blurb: 'Short 3-, 4-, or 5-beat motif on loop' },
  { id: 'medium', label: 'Medium', blurb: 'A free-form line — or a denser motif repeated' },
  { id: 'hard', label: 'Hard', blurb: '16th-note rhythms with syncopation' },
];

export function DifficultyPicker() {
  // Lazy initializers so persisted values are present on the first render.
  // Otherwise the Daily Challenge button (and toggles) flashes from its
  // default appearance to the correct one as useEffect runs after mount —
  // the .btn color transition makes the change visible.
  const [scores, setScores] = useState<HighScores | null>(() => loadHighScores());
  const [dailyDone] = useState(() => loadDailyEntry(todayUtcDateString()) !== null);
  const [liveFeedback, setLiveFeedback] = useState(() => loadSettings().liveFeedback);
  const [practiceMode, setPracticeMode] = useState(() => loadSettings().practiceMode);
  const [grooveSounds, setGrooveSounds] = useState(() => loadSettings().soundTheme === 'groove');
  const [instrument, setInstrument] = useState<Instrument>(() => loadSettings().instrument);
  const [showSettings, setShowSettings] = useState(false);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);

  // When the panel expands, slide it into view so the Instrument dropdown
  // at the bottom of the panel is visible without the user having to
  // scroll. Skipped on initial mount (showSettings starts false).
  useEffect(() => {
    if (!showSettings) return;
    const el = settingsPanelRef.current;
    if (!el) return;
    // Defer one frame so the panel has laid out before we measure it.
    const id = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [showSettings]);

  const onChangeInstrument = (next: Instrument) => {
    setInstrument(next);
    saveSettings({ instrument: next });
    // Play a quick 4-hit phrase so the player hears the new voice
    // without leaving the settings panel.
    void previewInstrument(next);
  };

  const onToggleLive = () => {
    const next = !liveFeedback;
    setLiveFeedback(next);
    saveSettings({ liveFeedback: next });
  };

  const onTogglePractice = () => {
    const next = !practiceMode;
    setPracticeMode(next);
    saveSettings({ practiceMode: next });
  };

  const onToggleGroove = () => {
    const next = !grooveSounds;
    setGrooveSounds(next);
    saveSettings({ soundTheme: next ? 'groove' : 'tones' });
  };

  const onClearStats = () => {
    const hasAny =
      (scores?.easy?.games ?? 0) +
        (scores?.medium?.games ?? 0) +
        (scores?.hard?.games ?? 0) >
      0;
    if (!hasAny) return;
    const ok = window.confirm(
      'Clear best scores and lifetime averages for Easy, Medium, and Hard? Daily challenge history is kept.',
    );
    if (!ok) return;
    clearHighScores();
    setScores(loadHighScores());
  };

  return (
    <div className="screen screen--picker">
      <h2 className="subtitle">Choose your challenge</h2>
      <div className="picker-grid">
        {LEVELS.map((lvl) => {
          const best = scores?.[lvl.id];
          return (
            <button
              key={lvl.id}
              className="picker-card"
              type="button"
              onClick={() => void startRound(lvl.id)}
            >
              <div className="picker-card__primary">
                <div className="picker-card__label">{lvl.label}</div>
                <div className="picker-card__blurb">{lvl.blurb}</div>
                <div className="picker-card__best">
                  {best ? `Best ${best.bestScore}` : 'No best yet'}
                </div>
              </div>
              {best && best.games > 0 && (
                <div className="picker-card__stats">
                  <div className="picker-card__avg">
                    Avg {Math.round(best.totalScore / best.games)}
                  </div>
                  <div className="picker-card__sub">
                    {Math.round(best.totalRhythm / best.games)}r · {Math.round(best.totalTempo / best.games)}t
                  </div>
                  <div className="picker-card__sub">
                    {best.games} {best.games === 1 ? 'play' : 'plays'}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <button
        className={`btn btn--daily ${dailyDone ? 'btn--done' : ''}`}
        type="button"
        onClick={() => goToDailyScreen()}
        disabled={practiceMode}
        title={practiceMode ? 'Disable Practice Mode to play the daily' : undefined}
      >
        Daily challenge {dailyDone ? '✓' : ''}
      </button>

      <button
        className="btn btn--secondary"
        type="button"
        onClick={goToArchiveScreen}
        disabled={practiceMode}
        title={practiceMode ? 'Disable Practice Mode to access archives' : undefined}
      >
        Past challenges
      </button>

      <div className="settings">
        <button
          className="settings__trigger"
          type="button"
          aria-expanded={showSettings}
          aria-controls="picker-settings-panel"
          onClick={() => setShowSettings((s) => !s)}
        >
          <span className="settings__gear" aria-hidden="true">⚙</span>
          <span>{showSettings ? 'Close settings' : 'Settings'}</span>
        </button>

        {showSettings && (
          <div className="settings__panel" id="picker-settings-panel" ref={settingsPanelRef}>
            <SettingRow
              label="Practice mode"
              hint="No scores saved"
              on={practiceMode}
              onToggle={onTogglePractice}
            />
            <SettingRow
              label="Live timing feedback"
              hint={practiceMode ? 'Color-flashes each tap' : 'Practice mode only'}
              on={liveFeedback}
              onToggle={onToggleLive}
              disabled={!practiceMode}
            />
            <SettingRow
              label="Groove sounds"
              hint="Drums / instruments instead of clicks"
              on={grooveSounds}
              onToggle={onToggleGroove}
            />
            <InstrumentRow
              value={instrument}
              onChange={onChangeInstrument}
              disabled={!grooveSounds}
            />
            {(scores?.easy?.games || scores?.medium?.games || scores?.hard?.games) ? (
              <button
                className="settings__clear"
                type="button"
                onClick={onClearStats}
              >
                Clear best scores
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

interface SettingRowProps {
  label: string;
  hint?: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function SettingRow({ label, hint, on, onToggle, disabled }: SettingRowProps) {
  return (
    <button
      className={`setting-row ${on ? 'setting-row--on' : ''} ${disabled ? 'setting-row--disabled' : ''}`}
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className="setting-row__text">
        <span className="setting-row__label">{label}</span>
        {hint && <span className="setting-row__hint">{hint}</span>}
      </span>
      <span className="setting-row__switch">
        <span className="setting-row__knob" />
      </span>
    </button>
  );
}

function InstrumentRow({
  value,
  onChange,
  disabled,
}: {
  value: Instrument;
  onChange: (next: Instrument) => void;
  disabled: boolean;
}) {
  return (
    <label
      className={`setting-row setting-row--dropdown ${disabled ? 'setting-row--disabled' : ''}`}
    >
      <span className="setting-row__text">
        <span className="setting-row__label">Instrument</span>
        <span className="setting-row__hint">
          {disabled ? 'Turn on Groove sounds to choose' : 'Voicing for groove sounds'}
        </span>
      </span>
      <select
        className="setting-row__select"
        value={value}
        onChange={(e) => onChange(e.target.value as Instrument)}
        disabled={disabled}
      >
        {INSTRUMENTS.map((inst) => (
          <option key={inst.id} value={inst.id}>
            {inst.label}
          </option>
        ))}
      </select>
    </label>
  );
}
