import { useGameState } from './game/useGame';
import { StartScreen } from './components/StartScreen';
import { DifficultyPicker } from './components/DifficultyPicker';
import { GameScreen } from './components/GameScreen';
import { ScoreScreen } from './components/ScoreScreen';
import { DailyChallenge } from './components/DailyChallenge';

export function App() {
  const state = useGameState();

  return (
    <div className="app">
      {state.screen === 'start' && <StartScreen />}
      {state.screen === 'picker' && <DifficultyPicker />}
      {state.screen === 'game' && <GameScreen state={state} />}
      {state.screen === 'score' && <ScoreScreen state={state} />}
      {state.screen === 'daily' && <DailyChallenge />}
      <footer className="footer">tappytap · a tiny rhythm game</footer>
    </div>
  );
}
