import type { RoundResult } from '../patterns/types';

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Open the native share sheet (iOS Messages, Android Share, etc.) with the
 * player's daily-challenge result. The URL we share points at the site,
 * which the receiving app turns into a rich preview using the OpenGraph
 * meta tags in `index.html` (title, description, image).
 *
 * Falls back to writing the same text + url to the clipboard when the
 * Web Share API isn't available (typically desktop browsers).
 */
export async function shareDailyResult(
  dateStr: string,
  result: RoundResult,
): Promise<ShareOutcome> {
  const text =
    `I scored ${result.totalScore} on TappyTap ${dateStr} ` +
    `(${result.rhythmScore}r / ${result.tempoScore}t)`;
  // Deep-link to the specific day so opening the shared link drops the
  // recipient straight into that challenge instead of the picker screen.
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?d=${encodeURIComponent(dateStr)}`
      : '';

  const shareData: ShareData = { title: 'TappyTap', text, url };

  // Web Share API: present on iOS Safari and most mobile browsers. The OS
  // handles whatever the user picks (Messages, Mail, etc.).
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const canShare =
      typeof navigator.canShare !== 'function' || navigator.canShare(shareData);
    if (canShare) {
      try {
        await navigator.share(shareData);
        return 'shared';
      } catch (err) {
        // AbortError = user closed the share sheet; anything else is a real
        // failure. Either way we don't fall through to clipboard so the
        // user isn't surprised by silent clipboard writes after dismissal.
        if (err && (err as { name?: string }).name === 'AbortError') {
          return 'cancelled';
        }
        return 'failed';
      }
    }
  }

  // Clipboard fallback.
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
