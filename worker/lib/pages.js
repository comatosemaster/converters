// The only HTML the Worker renders itself: the unsubscribe confirmation
// and its error page. Everything else is a prerendered page of the site.
// Self-contained (inline styles, no scripts) and in the site's colors.

import { escapeHtml } from './emails.js';

function shell({ title, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} | NeatSize</title>
<link rel="icon" href="/favicon.ico" sizes="32x32">
<style>
  :root { color-scheme: light dark; --bg:#fff; --card:#fafafa; --text:#09090b; --muted:#52525b; --border:#e6e6e9; --accent:#5b3df5; }
  @media (prefers-color-scheme: dark) { :root { --bg:#09090b; --card:#111114; --text:#fafafa; --muted:#a1a1aa; --border:#27272a; --accent:#8b7bff; } }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--text);
         font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,system-ui,sans-serif; }
  main { width:min(440px, calc(100% - 32px)); padding:32px; background:var(--card); border:1px solid var(--border); border-radius:16px; }
  .brand { display:inline-flex; align-items:center; gap:10px; color:var(--text); font-weight:700; font-size:18px; text-decoration:none; }
  .brand img { width:28px; height:28px; }
  .brand b { color:var(--accent); }
  h1 { margin:20px 0 8px; font-size:22px; }
  p { margin:0 0 20px; color:var(--muted); }
  button { padding:11px 20px; border:0; border-radius:8px; background:var(--accent); color:#fff; font:inherit; font-weight:600; cursor:pointer; }
  a.back { display:inline-block; margin-top:16px; color:var(--muted); font-size:14px; }
</style>
</head>
<body>
<main>
<a class="brand" href="/"><img src="/logo.svg" alt=""><span>Neat<b>Size</b></span></a>
${body}
</main>
</body>
</html>`;
}

export function unsubscribePage({ token, maskedEmail }) {
  return shell({
    title: 'Unsubscribe',
    body: `<h1>Unsubscribe from NeatSize updates?</h1>
<p>${escapeHtml(maskedEmail)} will stop getting emails about new tools and guides. You can subscribe again any time.</p>
<form method="post" action="/api/unsubscribe">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<button type="submit">Unsubscribe</button>
</form>
<a class="back" href="/">No thanks, take me to NeatSize</a>`,
  });
}

export function messagePage({ title, message }) {
  return shell({
    title,
    body: `<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
<a class="back" href="/">Go to NeatSize</a>`,
  });
}
