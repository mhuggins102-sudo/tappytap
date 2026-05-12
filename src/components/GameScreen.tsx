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
  // Listen Again stays visible from the moment the pattern starts playing
  // until the player makes their first tap. That covers the listening
  // phase, the brief gap before echo, and the "ready" sub-state of the
  // echo phase (echoStartTime === null). One use per round.
  const showListenAgain =
    state.listenAgainAvailable &&
    !state.listenAgainUsed &&
    (phase.kind === 'listening' ||
      (phase.kind === 'echoing' && phase.echoStartTime === null));

  return (
    <div className="screen screen--game">
      <div className="game-meta">
        <span className="game-meta__chip">
          {state.isDailyChallenge ? 'Daily' : state.isPractice ? 'Practice' : state.difficulty}
        </span>
        <span className="game-meta__phase">{subtitleFor(phase)}</span>
      </div>
      {showPractice && phase.kind === 'echoing' && <PracticeOverlay phase={phase} />}
      <TapTarget phase={phase} disabled={phase.kind !== 'echoing'} />
      <div className="game-help">{helpFor(phase)}</div>
      {showListenAgain && (
        <button className="btn btn--small listen-again" type="button" onClick={listenAgain}>
          Listen again
        </button>
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
