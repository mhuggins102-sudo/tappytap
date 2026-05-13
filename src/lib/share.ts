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
  // We share *only* the URL (no `text`, no `title`). iMessage uses its
  // large preview card only when the message body is a bare URL — any
  // surrounding text bumps it to the compact card. The shared URL hits
  // a Pages Function (/share/:date) which returns HTML with the score
  // baked into OG meta tags, so the large preview shows "I scored 87
  // on TappyTap" in the title. A human who taps the link gets bounced
  // straight to /?d=DATE by the function's redirect, which the SPA's
  // deep-link handler picks up.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = origin
    ? `${origin}/share/${encodeURIComponent(dateStr)}` +
      `?s=${result.totalScore}&r=${result.rhythmScore}&t=${result.tempoScore}`
    : '';

  const shareData: ShareData = { url };

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const canShare =
      typeof navigator.canShare !== 'function' || navigator.canShare(shareData);
    if (canShare) {
      try {
        await navigator.share(shareData);
        return 'shared';
      } catch (err) {
        if (err && (err as { name?: string }).name === 'AbortError') {
          return 'cancelled';
        }
        return 'failed';
      }
    }
  }

  // Clipboard fallback for browsers without Web Share API (mostly
  // desktop). Include a human-readable summary alongside the URL so the
  // pasted message reads like a real message instead of a bare link.
  const text =
    `I scored ${result.totalScore} on TappyTap ${dateStr} ` +
    `(${result.rhythmScore}r / ${result.tempoScore}t)`;
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
