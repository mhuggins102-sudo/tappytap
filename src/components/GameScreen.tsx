import { TapTarget } from './TapTarget';
import { PracticeOverlay } from './PracticeOverlay';
import { listenAgain } from '../game/gameLoop';
import type { GameState, Phase } from '../game/stateMachine';

interface Props {
  state: GameState;
}

export function GameScreen({ state }: Props) {
  const phase = state.phase;
  const showPractice = state.isPractice && phase.kind === 'echoing';
  // Reserve space for the Listen Again button for the entire qualifying
  // round — countdown through echo. The button itself appears inside
  // that slot only during the listening phase and the pre-tap echo
  // phase. Reserving the slot up front means appearance/disappearance
  // of the button doesn't recenter the tap target underneath.
  const slotReserved =
    state.listenAgainAvailable &&
    (phase.kind === 'countdown' ||
      phase.kind === 'listening' ||
      phase.kind === 'echoing');
  const buttonVisible =
    slotReserved &&
    !state.listenAgainUsed &&
    (phase.kind === 'listening' ||
      (phase.kind === 'echoing' && phase.echoStartTime === null));

  // Pass-and-Play uses the meta chip to surface who's playing and how far
  // along the match is — far more informative than the difficulty alone
  // when two players are sharing one device.
  const chipText = (() => {
    if (state.passAndPlay) {
      const m = state.passAndPlay;
      const name = m.currentRoundActivePlayer === 'p1' ? m.config.p1Name : m.config.p2Name;
      return `${name} · R${m.currentRoundIndex + 1}/10 · ${m.currentRoundDifficulty}`;
    }
    if (state.isDailyChallenge) return 'Daily';
    if (state.isPractice) return 'Practice';
    return state.difficulty;
  })();

  return (
    <div className="screen screen--game">
      <div className="game-meta">
        <span className="game-meta__chip">{chipText}</span>
        <span className="game-meta__phase">{subtitleFor(phase)}</span>
      </div>
      {showPractice && phase.kind === 'echoing' && <PracticeOverlay phase={phase} />}
      <TapTarget phase={phase} disabled={phase.kind !== 'echoing'} />
      <div className="game-help">{helpFor(phase)}</div>
      {slotReserved && (
        <div className="listen-again-slot">
          {buttonVisible && (
            <button className="btn btn--small listen-again" type="button" onClick={listenAgain}>
              Listen again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function subtitleFor(phase: Phase): string {
  switch (phase.kind) {
    case 'idle':
      return '';
    case 'countdown':
      return 'Count-in';
    case 'listening':
      return 'Listening';
    case 'echoing':
      return phase.echoStartTime === null ? 'Ready' : 'Echo';
    case 'scoring':
      return 'Scoring';
  }
}

function helpFor(phase: Phase): string {
  if (phase.kind === 'listening') return 'Listen carefully…';
  if (phase.kind === 'countdown') return 'Get ready…';
  if (phase.kind === 'echoing') {
    return phase.echoStartTime === null
      ? 'Tap when you’re ready to start.'
      : 'Tap the rest of the pattern.';
  }
  return '';
}
