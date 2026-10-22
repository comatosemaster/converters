// Email templates: plain, light HTML plus a plain-text version of each.
// Deliberately simple - one column, system fonts, no images or tracking
// pixels - so they render the same in every mail app and read like a
// note, not a marketing blast.

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function layout({ preheader, body, footer }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>NeatSize</title>
</head>
<body style="margin:0;padding:0;background:#f6f6f8;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f6f8;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e6e9;border-radius:12px;">
<tr><td style="padding:28px 28px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#18181b;">
<p style="margin:0 0 20px;font-size:18px;font-weight:700;color:#18181b;">Neat<span style="color:#5b3df5;">Size</span></p>
${body}
</td></tr>
<tr><td style="padding:8px 28px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#71717a;">
${footer}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function button(href, label) {
  return `<p style="margin:24px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 20px;background:#5b3df5;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">${escapeHtml(label)}</a></p>`;
}

/** The double opt-in email. `request` is the tool request text, if they came from that form. */
export function confirmationEmail({ confirmUrl, request }) {
  const requestLine = request
    ? `Thanks for requesting a tool: “${request.length > 160 ? `${request.slice(0, 157)}…` : request}”. Confirm your email and we’ll tell you when it’s live.`
    : null;

  const html = layout({
    preheader: 'One click to confirm - then you’ll get new tools and guides, about once a week at most.',
    body: [
      requestLine ? `<p style="margin:0 0 14px;">${escapeHtml(requestLine)}</p>` : '',
      '<p style="margin:0 0 14px;">Please confirm that you want NeatSize updates: an email when new tools or guides are published - at most once a week, and only when there’s something new.</p>',
      button(confirmUrl, 'Confirm my email'),
      `<p style="margin:0 0 14px;font-size:13px;color:#52525b;">Or paste this link into your browser:<br><a href="${escapeHtml(confirmUrl)}" style="color:#5b3df5;word-break:break-all;">${escapeHtml(confirmUrl)}</a></p>`,
    ].join('\n'),
    footer:
      'Didn’t sign up? Just ignore this email - without confirming, you won’t hear from us again and your address is deleted within 7 days.',
  });

  const text = [
    'NeatSize',
    '',
    ...(requestLine ? [requestLine, ''] : []),
    'Please confirm that you want NeatSize updates: an email when new tools or guides are published - at most once a week, and only when there’s something new.',
    '',
    `Confirm: ${confirmUrl}`,
    '',
    'Didn’t sign up? Just ignore this email - without confirming, you won’t hear from us again and your address is deleted within 7 days.',
  ].join('\n');

  return {
    subject: request ? 'Confirm your email - we’ll tell you when your tool ships' : 'Confirm your NeatSize subscription',
    html,
    text,
  };
}

/** Adds the newsletter's UTM tags to a site link. */
export function trackedUrl(url, campaign) {
  const target = new URL(url);
  target.searchParams.set('utm_source', 'newsletter');
  target.searchParams.set('utm_medium', 'email');
  if (campaign) target.searchParams.set('utm_campaign', campaign);
  return target.toString();
}

export function digestSubject(items) {
  const first = items[0]?.title ?? 'new tools and guides';
  return items.length > 1 ? `New on NeatSize: ${first} + ${items.length - 1} more` : `New on NeatSize: ${first}`;
}

/**
 * One subscriber's copy of the weekly digest.
 * items: [{ type: 'tool' | 'article', title, url, description }]
 * shipped: [{ description, url }] - their own requests that are now live.
 */
export function digestEmail({ items, shipped = [], unsubscribeUrl, campaign }) {
  const tools = items.filter((item) => item.type === 'tool');
  const guides = items.filter((item) => item.type !== 'tool');

  const section = (heading, list) =>
    list.length
      ? `<h2 style="margin:22px 0 10px;font-size:16px;color:#18181b;">${heading}</h2>\n${list
          .map(
            (item) =>
              `<p style="margin:0 0 14px;"><a href="${escapeHtml(trackedUrl(item.url, campaign))}" style="color:#5b3df5;font-weight:600;text-decoration:none;">${escapeHtml(item.title)}</a><br><span style="color:#52525b;">${escapeHtml(item.description)}</span></p>`,
          )
          .join('\n')}`
      : '';

  const shippedHtml = shipped
    .map(
      (request) =>
        `<p style="margin:0 0 16px;padding:12px 14px;background:#f1edff;border-radius:8px;">🎉 <strong>The tool you requested is live:</strong> <a href="${escapeHtml(trackedUrl(request.url, campaign))}" style="color:#5b3df5;">${escapeHtml(request.title || request.url)}</a></p>`,
    )
    .join('\n');

  const html = layout({
    preheader: items.map((item) => item.title).join(' · '),
    body: [
      shippedHtml,
      '<p style="margin:0 0 6px;">Here’s what’s new on NeatSize this week. Everything runs in your browser, free, with nothing uploaded.</p>',
      section('New tools', tools),
      section('New guides', guides),
    ].join('\n'),
    footer: `You’re getting this because you subscribed to NeatSize updates. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#71717a;">Unsubscribe in one click</a>.`,
  });

  const textSection = (heading, list) =>
    list.length ? [heading.toUpperCase(), ...list.map((item) => `- ${item.title}\n  ${item.description}\n  ${trackedUrl(item.url, campaign)}`), ''] : [];

  const text = [
    'NeatSize',
    '',
    ...shipped.map((request) => `The tool you requested is live: ${request.title || ''} ${trackedUrl(request.url, campaign)}\n`),
    'Here’s what’s new on NeatSize this week.',
    '',
    ...textSection('New tools', tools),
    ...textSection('New guides', guides),
    `Unsubscribe in one click: ${unsubscribeUrl}`,
  ].join('\n');

  return { subject: digestSubject(items), html, text };
}

/** Headers that let mail apps show their own one-click "Unsubscribe" (RFC 2369 / RFC 8058). */
export function unsubscribeHeaders(unsubscribeUrl) {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
