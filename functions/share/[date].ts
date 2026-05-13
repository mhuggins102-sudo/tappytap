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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;'
      : c === '<' ? '&lt;'
        : c === '>' ? '&gt;'
          : c === '"' ? '&quot;'
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
  const ogImage = `${origin}/og-image.png`;
  // Where the human lands when they tap the share link. The existing
  // ?d= deep-link handler in main.tsx picks this up and drops the
  // recipient straight into the daily challenge for that date.
  const target = `/?d=${encodeURIComponent(date)}`;

  const hasScore = total !== null && isScore(total);
  const title = hasScore
    ? `I scored ${Math.round(total)} on TappyTap`
    : 'TappyTap daily challenge';
  const desc =
    hasScore && rhythm !== null && tempo !== null && isScore(rhythm) && isScore(tempo)
      ? `Rhythm ${Math.round(rhythm)} · Tempo ${Math.round(tempo)} · ${date}`
      : `Listen, then tap the pattern back · ${date}`;

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
