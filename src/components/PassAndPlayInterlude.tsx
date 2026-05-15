import type { GameState } from '../game/stateMachine';
import { startNextPlayerTurn } from '../game/gameLoop';

interface Props {
  state: GameState;
}

/**
 * Quiet "pass the device" screen. Shown after the first player has
 * finished their turn and pressed "Pass to <name>" on their score
 * screen. Displays whose turn is next and the score they need to beat.
 * One full-screen tap starts that player's turn.
 */
export function PassAndPlayInterlude({ state }: Props) {
  const match = state.passAndPlay;
  if (!match) return null;
  const nextPlayer = match.currentRoundFirstPlayer === 'p1' ? 'p2' : 'p1';
  const nextName = nextPlayer === 'p1' ? match.config.p1Name : match.config.p2Name;
  const scoreToBeat = match.currentRoundFirstResult?.totalScore ?? 0;

  const onStart = () => void startNextPlayerTurn();

  return (
    <button
      type="button"
      className="pp-interlude"
      onClick={onStart}
      aria-label={`Start ${nextName}'s turn`}
    >
      <div className="pp-interlude__chip">
        Round {match.currentRoundIndex + 1} of 10 · {match.currentRoundDifficulty}
      </div>
      <h2 className="pp-interlude__name">{nextName}</h2>
      <p className="pp-interlude__sub">it's your turn</p>
      <div className="pp-interlude__beat">
        <span className="pp-interlude__beat-label">Score to beat</span>
        <span className="pp-interlude__beat-score">{scoreToBeat}</span>
      </div>
      <p className="pp-interlude__cta">Tap anywhere to start</p>
    </button>
  );
}
