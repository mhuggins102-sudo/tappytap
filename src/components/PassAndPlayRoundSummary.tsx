import type { GameState } from '../game/stateMachine';
import { advancePassAndPlayRound, exitPassAndPlay } from '../game/gameLoop';

interface Props {
  state: GameState;
}

const TOTAL_ROUNDS = 10;

/**
 * Round-end scoreboard. Shows both players' scores for the round just
 * completed, the round winner, the cumulative match scoreboard
 * (P1 wins – P2 wins, with ties surfaced), and a "Next round" button.
 * Also tells the player when the match is heading into its decisive
 * round so the moment lands.
 */
export function PassAndPlayRoundSummary({ state }: Props) {
  const match = state.passAndPlay;
  if (!match || match.history.length === 0) return null;
  const lastOutcome = match.history[match.history.length - 1];
  const { p1Name, p2Name } = match.config;
  const { p1Result, p2Result, winner } = lastOutcome;

  const remaining = TOTAL_ROUNDS - match.history.length;
  const clinched =
    match.p1Wins > match.p2Wins + remaining || match.p2Wins > match.p1Wins + remaining;
  const isFinalRound = match.history.length >= TOTAL_ROUNDS || clinched;

  const advanceLabel = isFinalRound ? 'See results' : 'Next round';

  return (
    <div className="screen screen--pp-summary">
      <div className="pp-summary__chip">
        Round {lastOutcome.roundIndex + 1} · {lastOutcome.difficulty}
      </div>

      <div className="pp-summary__round">
        <PlayerScoreCard
          name={p1Name}
          score={p1Result.totalScore}
          highlighted={winner === 'p1'}
          dim={winner === 'p2'}
        />
        <div className="pp-summary__vs">vs</div>
        <PlayerScoreCard
          name={p2Name}
          score={p2Result.totalScore}
          highlighted={winner === 'p2'}
          dim={winner === 'p1'}
        />
      </div>

      <div className="pp-summary__winner">
        {winner === 'tie'
          ? 'Round tied — no point awarded'
          : `${winner === 'p1' ? p1Name : p2Name} wins the round`}
      </div>

      <details className="pp-summary__scoreboard">
        <summary className="pp-summary__scoreboard-summary">
          <div className="pp-summary__scoreboard-totals">
            <div className="pp-summary__scoreboard-cell">
              <span className="pp-summary__scoreboard-name">{p1Name}</span>
              <span className="pp-summary__scoreboard-wins">{match.p1Wins}</span>
            </div>
            <div className="pp-summary__scoreboard-cell">
              <span className="pp-summary__scoreboard-name">{p2Name}</span>
              <span className="pp-summary__scoreboard-wins">{match.p2Wins}</span>
            </div>
          </div>
          <span className="pp-summary__scoreboard-toggle" aria-hidden="true">
            <span className="pp-summary__scoreboard-toggle-text">Round history</span>
            <span className="pp-summary__scoreboard-toggle-chevron">▾</span>
          </span>
        </summary>
        <ol className="pp-summary__history">
          {match.history.map((o) => (
            <li
              key={o.roundIndex}
              className={`pp-summary__history-row pp-summary__history-row--${o.winner}`}
            >
              <span className="pp-summary__history-idx">R{o.roundIndex + 1}</span>
              <span
                className={`pp-summary__history-score ${o.winner === 'p1' ? 'pp-summary__history-score--win' : ''}`}
              >
                {o.p1Result.totalScore}
              </span>
              <span className="pp-summary__history-mid">vs</span>
              <span
                className={`pp-summary__history-score ${o.winner === 'p2' ? 'pp-summary__history-score--win' : ''}`}
              >
                {o.p2Result.totalScore}
              </span>
              <span className="pp-summary__history-diff">{o.difficulty}</span>
            </li>
          ))}
        </ol>
        {match.ties > 0 && (
          <div className="pp-summary__history-tie-note">
            {match.ties} {match.ties === 1 ? 'tied round' : 'tied rounds'} — no point awarded
          </div>
        )}
      </details>

      <div className="pp-summary__actions">
        <button
          className="btn btn--primary"
          type="button"
          onClick={advancePassAndPlayRound}
        >
          {advanceLabel}
        </button>
        <button className="btn" type="button" onClick={exitPassAndPlay}>
          Quit
        </button>
      </div>
    </div>
  );
}

function PlayerScoreCard({
  name,
  score,
  highlighted,
  dim,
}: {
  name: string;
  score: number;
  highlighted: boolean;
  dim: boolean;
}) {
  return (
    <div
      className={`pp-summary__player ${
        highlighted ? 'pp-summary__player--win' : ''
      } ${dim ? 'pp-summary__player--lost' : ''}`}
    >
      <div className="pp-summary__player-name">{name}</div>
      <div className="pp-summary__player-score">{score}</div>
    </div>
  );
}
