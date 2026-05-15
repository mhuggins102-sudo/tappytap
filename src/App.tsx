import { useEffect, useState } from 'react';
import { useGameState } from './game/useGame';
import { StartScreen } from './components/StartScreen';
import { DifficultyPicker } from './components/DifficultyPicker';
import { GameScreen } from './components/GameScreen';
import { ScoreScreen } from './components/ScoreScreen';
import { DailyChallenge } from './components/DailyChallenge';
import { DailyArchive } from './components/DailyArchive';
import { PassAndPlaySetup } from './components/PassAndPlaySetup';
import { PassAndPlayInterlude } from './components/PassAndPlayInterlude';
import { PassAndPlayRoundSummary } from './components/PassAndPlayRoundSummary';
import { PassAndPlayGameOver } from './components/PassAndPlayGameOver';
import { loadSettings, SETTINGS_CHANGE_EVENT } from './lib/storage';

export function App() {
  const state = useGameState();
  // Display-mode flags live at the root so a single class toggle drives
  // the CSS for colorblind shapes / reduced motion across every screen.
  const [colorblind, setColorblind] = useState(() => loadSettings().colorblind);
  const [reduceMotion, setReduceMotion] = useState(() => loadSettings().reduceMotion);

  useEffect(() => {
    const refresh = () => {
      const s = loadSettings();
      setColorblind(s.colorblind);
      setReduceMotion(s.reduceMotion);
    };
    window.addEventListener(SETTINGS_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(SETTINGS_CHANGE_EVENT, refresh);
  }, []);

  const rootClass = [
    'app',
    colorblind ? 'app--colorblind' : '',
    reduceMotion ? 'app--reduce-motion' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass}>
      <div className="app__screen-wrap">
        {state.screen === 'start' && <StartScreen />}
        {state.screen === 'picker' && <DifficultyPicker />}
        {state.screen === 'game' && <GameScreen state={state} />}
        {state.screen === 'score' && <ScoreScreen state={state} />}
        {state.screen === 'daily' && <DailyChallenge state={state} />}
        {state.screen === 'archive' && <DailyArchive />}
        {state.screen === 'passAndPlaySetup' && <PassAndPlaySetup />}
        {state.screen === 'passAndPlayInterlude' && <PassAndPlayInterlude state={state} />}
        {state.screen === 'passAndPlayRoundSummary' && <PassAndPlayRoundSummary state={state} />}
        {state.screen === 'passAndPlayGameOver' && <PassAndPlayGameOver state={state} />}
      </div>
      <footer className="footer">tappytap · a tiny rhythm game</footer>
    </div>
  );
}
