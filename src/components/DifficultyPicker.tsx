import { useEffect, useState } from 'react';
import { startRound, goToDailyScreen } from '../game/gameLoop';
import {
  clearHighScores,
  loadHighScores,
  loadSettings,
  saveSettings,
  type HighScores,
} from '../lib/storage';
import { loadDailyEntry } from '../lib/storage';
import { todayUtcDateString } from '../patterns/daily';
import type { Difficulty } from '../patterns/types';

const LEVELS: Array<{ id: Difficulty; label: string; blurb: string }> = [
  { id: 'easy', label: 'Easy', blurb: '4-tap motif, repeats ×4–5' },
  { id: 'medium', label: 'Medium', blurb: 'Quarters + eighths' },
  { id: 'hard', label: 'Hard', blurb: 'Syncopation + 16ths' },
];

export function DifficultyPicker() {
  const [scores, setScores] = useState<HighScores | null>(null);
  const [dailyDone, setDailyDone] = useState(false);
  const [liveFeedback, setLiveFeedback] = useState(true);
  const [practiceMode, setPracticeMode] = useState(false);
  const [grooveSounds, setGrooveSounds] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    setScores(loadHighScores());
    setDailyDone(loadDailyEntry(todayUtcDateString()) !== null);
    const s = loadSettings();
    setLiveFeedback(s.liveFeedback);
    setPracticeMode(s.practiceMode);
    setGrooveSounds(s.soundTheme === 'groove');
  }, []);

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
        onClick={goToDailyScreen}
        disabled={practiceMode}
        title={practiceMode ? 'Disable Practice Mode to play the daily' : undefined}
      >
        Daily challenge {dailyDone ? '✓' : ''}
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
          <div className="settings__panel" id="picker-settings-panel">
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
              hint="Drums instead of clicks"
              on={grooveSounds}
              onToggle={onToggleGroove}
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
