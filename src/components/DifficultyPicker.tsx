import { useEffect, useRef, useState } from 'react';
import { startRound, goToDailyScreen, goToArchiveScreen, goToPassAndPlaySetup } from '../game/gameLoop';
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

const LEVELS: Array<{ id: Difficulty; label: string; description: string }> = [
  {
    id: 'easy',
    label: 'Easy',
    description:
      'A short 3-, 4-, or 5-beat motif looped a few times. Steady pulse with no syncopation — the easiest level. Tempo varies up to ±15% between rounds.',
  },
  {
    id: 'medium',
    label: 'Medium',
    description:
      'Mostly free-form 8th-note rhythms. Sometimes a denser motif played twice, or a classic figure like tresillo, habanera, cascara, or mozambique. Tempo varies up to ±20%. Occasionally surprises with a 3-measure round, a sparse pattern, or a density ramp from 8ths into 16ths.',
  },
  {
    id: 'hard',
    label: 'Hard',
    description:
      '16th-note syncopation — notes shift off the beat to create tension. Sometimes a classic figure like bossa, dembow, songo, or cha-cha-cha. Tempo varies up to ±25%. Occasionally a 3-measure round or a sparse-rest surprise.',
  },
];

export function DifficultyPicker() {
  // Lazy initializers so persisted values are present on the first render —
  // avoids the Daily Challenge button (and toggles) flashing default-then-correct.
  const [scores, setScores] = useState<HighScores | null>(() => loadHighScores());
  const [dailyDone] = useState(() => loadDailyEntry(todayUtcDateString()) !== null);
  const [practiceMode, setPracticeMode] = useState(() => loadSettings().practiceMode);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="screen screen--picker">
      <div className="picker-header">
        <h2 className="subtitle">Choose your challenge</h2>
        <button
          className="picker-header__gear"
          type="button"
          aria-label="Open settings"
          aria-haspopup="dialog"
          onClick={() => setShowSettings(true)}
        >
          <span aria-hidden="true">⚙</span>
        </button>
      </div>

      <SoloSection scores={scores} />

      <button
        className="btn btn--pass-and-play"
        type="button"
        onClick={() => goToPassAndPlaySetup()}
      >
        Pass and Play
      </button>

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

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          scores={scores}
          onClearStats={() => {
            clearHighScores();
            setScores(loadHighScores());
          }}
          onPracticeChange={(v) => setPracticeMode(v)}
        />
      )}
    </div>
  );
}

interface SoloSectionProps {
  scores: HighScores | null;
}

function SoloSection({ scores }: SoloSectionProps) {
  // Only one info popover is open at a time. Tapping outside dismisses.
  const [openInfo, setOpenInfo] = useState<Difficulty | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openInfo) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenInfo(null);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [openInfo]);

  return (
    <section className="solo-section" ref={ref}>
      <h3 className="solo-section__title">Solo</h3>
      <div className="picker-grid">
        {LEVELS.map((lvl) => {
          const best = scores?.[lvl.id];
          const isOpen = openInfo === lvl.id;
          return (
            <div key={lvl.id} className="picker-card-wrapper">
              <button
                className="picker-card"
                type="button"
                onClick={() => void startRound(lvl.id)}
              >
                <div className="picker-card__primary">
                  <div className="picker-card__label">{lvl.label}</div>
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
              <button
                className="picker-card__info"
                type="button"
                aria-label={`About ${lvl.label}`}
                aria-expanded={isOpen}
                onClick={() => setOpenInfo((prev) => (prev === lvl.id ? null : lvl.id))}
              >
                i
              </button>
              {isOpen && (
                <div className="picker-card__popover" role="tooltip">
                  <strong className="picker-card__popover-title">{lvl.label}</strong>
                  <span>{lvl.description}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface SettingsModalProps {
  onClose: () => void;
  scores: HighScores | null;
  onClearStats: () => void;
  onPracticeChange: (v: boolean) => void;
}

function SettingsModal({ onClose, scores, onClearStats, onPracticeChange }: SettingsModalProps) {
  // Re-read so the modal always shows current settings even if changed
  // elsewhere; mutations route through saveSettings + local state so the
  // toggles feel immediate.
  const initial = loadSettings();
  const [liveFeedback, setLiveFeedback] = useState(initial.liveFeedback);
  const [practiceMode, setPracticeMode] = useState(initial.practiceMode);
  const [grooveSounds, setGrooveSounds] = useState(initial.soundTheme === 'groove');
  const [instrument, setInstrument] = useState<Instrument>(initial.instrument);
  const [colorblind, setColorblind] = useState(initial.colorblind);
  const [reduceMotion, setReduceMotion] = useState(initial.reduceMotion);

  // Escape closes the modal (alongside the backdrop click and the X button).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onChangeInstrument = (next: Instrument) => {
    setInstrument(next);
    saveSettings({ instrument: next });
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
    onPracticeChange(next);
  };

  const onToggleGroove = () => {
    const next = !grooveSounds;
    setGrooveSounds(next);
    saveSettings({ soundTheme: next ? 'groove' : 'tones' });
  };

  const onToggleColorblind = () => {
    const next = !colorblind;
    setColorblind(next);
    saveSettings({ colorblind: next });
  };

  const onToggleReduceMotion = () => {
    const next = !reduceMotion;
    setReduceMotion(next);
    saveSettings({ reduceMotion: next });
  };

  const onClickClear = () => {
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
    onClearStats();
  };

  const hasAnyStats =
    (scores?.easy?.games ?? 0) +
      (scores?.medium?.games ?? 0) +
      (scores?.hard?.games ?? 0) >
    0;

  return (
    <div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="settings-modal__backdrop" onClick={onClose} />
      <div className="settings-modal__panel">
        <header className="settings-modal__header">
          <h3 id="settings-title" className="settings-modal__title">Settings</h3>
          <button
            className="settings-modal__close"
            type="button"
            aria-label="Close settings"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="settings-modal__body">
          <section className="settings-section">
            <h4 className="settings-section__title">Sound</h4>
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
          </section>

          <section className="settings-section">
            <h4 className="settings-section__title">Play</h4>
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
          </section>

          <section className="settings-section">
            <h4 className="settings-section__title">Display</h4>
            <SettingRow
              label="Colorblind shapes"
              hint="Add glyphs alongside colors"
              on={colorblind}
              onToggle={onToggleColorblind}
            />
            <SettingRow
              label="Reduce motion"
              hint="Suppress pulse and flash animations"
              on={reduceMotion}
              onToggle={onToggleReduceMotion}
            />
          </section>

          {hasAnyStats && (
            <section className="settings-section">
              <h4 className="settings-section__title">Data</h4>
              <button
                className="settings__clear"
                type="button"
                onClick={onClickClear}
              >
                Clear best scores
              </button>
            </section>
          )}
        </div>
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
