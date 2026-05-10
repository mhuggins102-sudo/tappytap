import { TapTarget } from './TapTarget';
import type { GameState, Phase } from '../game/stateMachine';

interface Props {
  state: GameState;
}

export function GameScreen({ state }: Props) {
  const phase = state.phase;

  return (
    <div className="screen screen--game">
      <div className="game-meta">
        <span className="game-meta__chip">{state.isDailyChallenge ? 'Daily' : state.difficulty}</span>
        <span className="game-meta__phase">{subtitleFor(phase)}</span>
      </div>
      <TapTarget phase={phase} disabled={phase.kind !== 'echoing'} />
      <div className="game-help">{helpFor(phase)}</div>
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
