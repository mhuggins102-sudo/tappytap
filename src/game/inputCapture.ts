import { getEngine } from '../audio/audioContext';

type TapHandler = (audioTime: number) => void;

let activeHandler: TapHandler | null = null;

function onKeyDown(e: KeyboardEvent): void {
  if (!activeHandler) return;
  if (e.code !== 'Space') return;
  if (e.repeat) return;
  e.preventDefault();
  const eng = getEngine();
  if (!eng) return;
  activeHandler(eng.audioTimeFromEvent(e));
}

window.addEventListener('keydown', onKeyDown);

export function startCapture(handler: TapHandler): () => void {
  activeHandler = handler;
  return () => {
    if (activeHandler === handler) activeHandler = null;
  };
}

export function handlePointerTap(e: PointerEvent): void {
  if (!activeHandler) return;
  const eng = getEngine();
  if (!eng) return;
  activeHandler(eng.audioTimeFromEvent(e));
}
