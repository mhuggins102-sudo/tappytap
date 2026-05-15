import type { GameState, PassAndPlayMatch } from '../game/stateMachine';
import { exitPassAndPlay, startPassAndPlayMatch } from '../game/gameLoop';

interface Props {
  state: GameState;
}

interface MatchOutcome {
  winner: 'p1' | 'p2' | 'tie';
  reason: 'rounds' | 'avg_score' | 'draw';
  p1AvgScore: number;
  p2AvgScore: number;
}

function decideMatch(match: PassAndPlayMatch): MatchOutcome {
  const rounds = match.history.length;
  const p1AvgScore =
    rounds > 0 ? match.history.reduce((s, o) => s + o.p1Result.totalScore, 0) / rounds : 0;
  const p2AvgScore =
    rounds > 0 ? match.history.reduce((s, o) => s + o.p2Result.totalScore, 0) / rounds : 0;
  if (match.p1Wins > match.p2Wins) return { winner: 'p1', reason: 'rounds', p1AvgScore, p2AvgScore };
  if (match.p2Wins > match.p1Wins) return { winner: 'p2', reason: 'rounds', p1AvgScore, p2AvgScore };
  // Round wins are tied — fall back to average total score.
  if (p1AvgScore > p2AvgScore) return { winner: 'p1', reason: 'avg_score', p1AvgScore, p2AvgScore };
  if (p2AvgScore > p1AvgScore) return { winner: 'p2', reason: 'avg_score', p1AvgScore, p2AvgScore };
  return { winner: 'tie', reason: 'draw', p1AvgScore, p2AvgScore };
}

export function PassAndPlayGameOver({ state }: Props) {
  const match = state.passAndPlay;
  if (!match) return null;
  const outcome = decideMatch(match);
  const { p1Name, p2Name } = match.config;

  const winnerName =
    outcome.winner === 'tie'
      ? 'Draw'
      : outcome.winner === 'p1'
      ? p1Name
      : p2Name;

  const reasonText = (() => {
    switch (outcome.reason) {
      case 'rounds':
        return `${match.p1Wins} – ${match.p2Wins}${match.ties > 0 ? ` (${match.ties} ${match.ties === 1 ? 'tie' : 'ties'})` : ''}`;
      case 'avg_score':
        return `Round wins tied ${match.p1Wins}–${match.p2Wins}. Decided by average score: ${Math.round(outcome.p1AvgScore)} vs ${Math.round(outcome.p2AvgScore)}.`;
      case 'draw':
        return `${match.p1Wins}–${match.p2Wins} on round wins. Average score also tied at ${Math.round(outcome.p1AvgScore)}.`;
    }
  })();

  const playAgain = () => {
    // Re-use the same config so the players don't have to re-enter names
    // or instruments. The defaults storage was already saved from the
    // setup screen, so the next match also picks up where they left off.
    void startPassAndPlayMatch(match.config);
  };

  return (
    <div className="screen screen--pp-gameover">
      <div className="pp-gameover__chip">Match complete</div>
      <div className="pp-gameover__winner-label">
        {outcome.winner === 'tie' ? 'It’s a' : 'Winner'}
      </div>
      <h2 className="pp-gameover__winner">{winnerName}</h2>
      <p className="pp-gameover__reason">{reasonText}</p>

      <div className="pp-gameover__totals">
        <PlayerTotal
          name={p1Name}
          wins={match.p1Wins}
          avgScore={outcome.p1AvgScore}
          winning={outcome.winner === 'p1'}
        />
        <PlayerTotal
          name={p2Name}
          wins={match.p2Wins}
          avgScore={outcome.p2AvgScore}
          winning={outcome.winner === 'p2'}
        />
      </div>

      {match.history.length > 0 && (
        <details className="pp-gameover__history">
          <summary>Round-by-round</summary>
          <ol className="pp-gameover__history-list">
            {match.history.map((o) => (
              <li key={o.roundIndex} className="pp-gameover__history-row">
                <span className="pp-gameover__history-idx">R{o.roundIndex + 1}</span>
                <span className="pp-gameover__history-diff">{o.difficulty}</span>
                <span
                  className={`pp-gameover__history-score ${o.winner === 'p1' ? 'pp-gameover__history-score--win' : ''}`}
                >
                  {o.p1Result.totalScore}
                </span>
                <span className="pp-gameover__history-vs">·</span>
                <span
                  className={`pp-gameover__history-score ${o.winner === 'p2' ? 'pp-gameover__history-score--win' : ''}`}
                >
                  {o.p2Result.totalScore}
                </span>
                <span className="pp-gameover__history-winner">
                  {o.winner === 'tie' ? '—' : o.winner === 'p1' ? p1Name : p2Name}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}

      <div className="pp-gameover__actions">
        <button className="btn btn--primary" type="button" onClick={playAgain}>
          Play again
        </button>
        <button className="btn" type="button" onClick={exitPassAndPlay}>
          Home
        </button>
      </div>
    </div>
  );
}

function PlayerTotal({
  name,
  wins,
  avgScore,
  winning,
}: {
  name: string;
  wins: number;
  avgScore: number;
  winning: boolean;
}) {
  return (
    <div className={`pp-gameover__total ${winning ? 'pp-gameover__total--win' : ''}`}>
      <div className="pp-gameover__total-name">{name}</div>
      <div className="pp-gameover__total-wins">{wins}</div>
      <div className="pp-gameover__total-wins-label">round wins</div>
      <div className="pp-gameover__total-avg">avg {Math.round(avgScore)}</div>
    </div>
  );
}
