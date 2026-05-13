// /share/:date — dynamic OG-tags response for daily-challenge share
// links. The static SPA can't change its <meta property="og:*"> tags
// per-share, so we hop through this Pages Function whose only job is
// to return HTML with the player's score baked into the OpenGraph
// metadata, then immediately redirect a real browser visit to the
// actual game route.
//
// Why this exists: iMessage (and Twitter / Slack / Discord) renders
// a large preview card only when the message body is a bare URL with
// no surrounding text. Sending "I scored 87 — <link>" via Web Share
// puts iMessage into the compact-card path (square thumbnail, no
// description). By moving the score into the URL's metadata, the
// shared message can be just the URL — large card territory — while
// still showing the score in the title.

import { isScore, isValidDate, type PagesFunction } from '../_shared';

// Replicate the difficulty-from-date math from src/patterns/daily.ts +
// src/lib/rng.ts so the share preview's difficulty label matches what
// the player actually faced. Keep these in sync if either file changes.
function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dailyDifficultyFor(dateStr: string): 'medium' | 'hard' {
  const rng = mulberry32(hashString(`tappytap:difficulty:${dateStr}`));
  return rng() < 0.5 ? 'medium' : 'hard';
}

function escapeHtml(s: string): string {
  // We also encode newlines as numeric character references so they
  // survive HTML attribute parsing (browsers normalise raw whitespace
  // inside attribute values to a single space). Some link-preview
  // clients honour the entity-encoded newline and render the title on
  // two lines; others still collapse it, which is fine because the
  // sentence break reads naturally either way.
  return s.replace(/[&<>"'\n]/g, (c) =>
    c === '&' ? '&amp;'
      : c === '<' ? '&lt;'
        : c === '>' ? '&gt;'
          : c === '"' ? '&quot;'
            : c === '\n' ? '&#10;'
              : '&#39;',
  );
}

function asNumber(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const onRequestGet: PagesFunction = async ({ request, params }) => {
  const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const date = typeof rawDate === 'string' ? rawDate : '';
  if (!isValidDate(date)) {
    return new Response('Bad date', { status: 400 });
  }

  const url = new URL(request.url);
  const total = asNumber(url.searchParams.get('s'));
  const rhythm = asNumber(url.searchParams.get('r'));
  const tempo = asNumber(url.searchParams.get('t'));

  const origin = `${url.protocol}//${url.host}`;
  // Dynamic share image with the score baked into the picture itself,
  // so iMessage's preview card (which renders the image prominently
  // and hides the description) puts the score in front of the reader
  // regardless of how much text the client chooses to show. The image
  // URL carries the same querystring so the renderer has every number
  // it needs.
  const ogImage = `${origin}/share-image/${encodeURIComponent(date)}${url.search}`;
  // Where the human lands when they tap the share link. The existing
  // ?d= deep-link handler in main.tsx picks this up and drops the
  // recipient straight into the daily challenge for that date.
  const target = `/?d=${encodeURIComponent(date)}`;

  const hasScore = total !== null && isScore(total);
  const difficulty = dailyDifficultyFor(date);
  const difficultyLabel = difficulty[0].toUpperCase() + difficulty.slice(1);
  // The dynamic /share-image PNG already bakes the full readout
  // (score, rhythm, tempo, difficulty, date) into the picture itself,
  // so the title can lean into a short friendly call-to-action
  // instead of duplicating the numbers. A literal newline separates
  // the two sentences — see escapeHtml for how that's preserved.
  const title = hasScore
    ? `I scored ${Math.round(total)} on TappyTap (${difficultyLabel}).\nCan you beat my score?`
    : `TappyTap daily challenge (${difficultyLabel}).\nThink you can crack it?`;
  // Description stays informative for clients that DO show it
  // (Mac iMessage, Slack, Discord, search crawlers).
  const desc =
    hasScore && rhythm !== null && tempo !== null && isScore(rhythm) && isScore(tempo)
      ? `Rhythm ${Math.round(rhythm)} · Tempo ${Math.round(tempo)} · ${difficultyLabel} · ${date}`
      : `${difficultyLabel} daily challenge · ${date}`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${origin}${url.pathname}${url.search}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(desc)}">
<meta name="twitter:image" content="${ogImage}">
<meta http-equiv="refresh" content="0; url=${escapeHtml(target)}">
<style>html,body{margin:0;font-family:system-ui;background:#0b0d12;color:#e9ecf2}a{color:#7c5cff}</style>
</head>
<body>
<p style="padding:24px">Opening <a href="${escapeHtml(target)}">TappyTap ${escapeHtml(date)}</a>…</p>
<script>location.replace(${JSON.stringify(target)})</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Five-minute cache so re-shares of the same URL stay cheap, but
      // short enough that we can iterate on the title/description copy
      // without waiting on stale previews.
      'cache-control': 'public, max-age=300',
    },
  });
};
