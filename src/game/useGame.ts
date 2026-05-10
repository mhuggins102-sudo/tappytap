import { useSyncExternalStore } from 'react';
import { gameStore } from './gameLoop';

export function useGameState() {
  return useSyncExternalStore(gameStore.subscribe, gameStore.get, gameStore.get);
}
