// Small response/request helpers shared by the API routes.

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS },
  });
}

/** 303 See Other: after a POST (or a confirm link), land on a normal GET page. */
export function redirect(location, status = 303) {
  return new Response(null, { status, headers: { location, 'cache-control': 'no-store', ...SECURITY_HEADERS } });
}

export function html(markup, status = 200) {
  return new Response(markup, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      // These pages are just a form - nothing on them may be framed or
      // run third-party code.
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'",
      ...SECURITY_HEADERS,
    },
  });
}

export function methodNotAllowed(allowed) {
  return new Response('Method not allowed', { status: 405, headers: { allow: allowed } });
}

/**
 * Reads a JSON or form-encoded body into a plain object. Returns null for
 * anything unreadable (wrong type, malformed, or over `maxBytes`).
 */
export async function readBody(request, maxBytes = 16 * 1024) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) return null;
  const type = request.headers.get('content-type') || '';
  try {
    const text = await request.text();
    if (text.length > maxBytes) return null;
    if (type.includes('application/json')) {
      const data = JSON.parse(text);
      return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
    }
    if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data') || text.includes('=')) {
      return Object.fromEntries(new URLSearchParams(text));
    }
    return {};
  } catch {
    return null;
  }
}

/** The visitor's IP as Cloudflare reports it ('' locally if absent). */
export function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || '';
}
