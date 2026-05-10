import { TapTarget } from './TapTarget';
import type { GameState } from '../game/stateMachine';

interface Props {
  state: GameState;
}

export function GameScreen({ state }: Props) {
  const phase = state.phase;
  const subtitle = subtitleFor(phase.kind);

  return (
    <div className="screen screen--game">
      <div className="game-meta">
        <span className="game-meta__chip">{state.isDailyChallenge ? 'Daily' : state.difficulty}</span>
        <span className="game-meta__phase">{subtitle}</span>
      </div>
      <TapTarget phase={phase} disabled={phase.kind !== 'echoing'} />
      <div className="game-help">
        {phase.kind === 'listening' && 'Listen carefully…'}
        {phase.kind === 'echoing' && 'Tap the pattern you just heard.'}
        {phase.kind === 'countdown' && 'Get ready…'}
      </div>
    </div>
  );
}

function subtitleFor(kind: GameState['phase']['kind']): string {
  switch (kind) {
    case 'idle':
      return '';
    case 'countdown':
      return 'Count-in';
    case 'listening':
      return 'Listening';
    case 'echoing':
      return 'Echo';
    case 'scoring':
      return 'Scoring';
  }
}
