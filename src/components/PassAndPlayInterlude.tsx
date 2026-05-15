import type { GameState } from '../game/stateMachine';
import { beginActivePlayerTurn } from '../game/gameLoop';

interface Props {
  state: GameState;
}

/**
 * Quiet "your turn" screen. Shown both at the start of every round
 * after the first (so players see whose turn it is before audio starts)
 * and mid-round between the two players. The score-to-beat box only
 * appears in the within-round case, when the first player has already
 * locked in a score.
 */
export function PassAndPlayInterlude({ state }: Props) {
  const match = state.passAndPlay;
  if (!match) return null;
  const activeName =
    match.currentRoundActivePlayer === 'p1' ? match.config.p1Name : match.config.p2Name;
  const firstResult = match.currentRoundFirstResult;
  const isRoundStart = firstResult === null;
  const subText = isRoundStart ? 'starting the round' : 'it’s your turn';

  return (
    <button
      type="button"
      className="pp-interlude"
      onClick={() => void beginActivePlayerTurn()}
      aria-label={`Start ${activeName}'s turn`}
    >
      <div className="pp-interlude__chip">
        Round {match.currentRoundIndex + 1} of 10 · {match.currentRoundDifficulty}
      </div>
      <h2 className="pp-interlude__name">{activeName}</h2>
      <p className="pp-interlude__sub">{subText}</p>
      {firstResult && (
        <div className="pp-interlude__beat">
          <span className="pp-interlude__beat-label">Score to beat</span>
          <span className="pp-interlude__beat-score">{firstResult.totalScore}</span>
        </div>
      )}
      <p className="pp-interlude__cta">Tap anywhere to start</p>
    </button>
  );
}
