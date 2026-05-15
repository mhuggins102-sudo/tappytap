import type { GameState } from '../game/stateMachine';
import { beginActivePlayerTurn } from '../game/gameLoop';

interface Props {
  state: GameState;
}

/**
 * Quiet "your turn" screen. Shown at the start of every round (including
 * round 1, where the first player is picked at random) and mid-round
 * between the two players. The score-to-beat box only appears in the
 * within-round case, when the first player has already locked in a score.
 */
export function PassAndPlayInterlude({ state }: Props) {
  const match = state.passAndPlay;
  if (!match) return null;
  const activeName =
    match.currentRoundActivePlayer === 'p1' ? match.config.p1Name : match.config.p2Name;
  const firstResult = match.currentRoundFirstResult;

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
      <p className="pp-interlude__sub">your turn</p>
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
