// A stand-in for the Resend API, for local end-to-end tests. The Worker
// talks to it instead of Resend when RESEND_API_URL points here (.dev.vars),
// so tests can read "sent" emails and nobody is ever emailed for real.
//
//   POST /emails, POST /emails/batch   - recorded, answered like Resend
//   GET  /_sent                        - everything recorded so far
//   POST /_reset                       - forget it all
//   POST /_fail?count=N                - make the next N sends fail (500)

import http from 'node:http';

const PORT = Number(process.env.FAKE_RESEND_PORT || 4300);
let sent = [];
let failNext = 0;
let nextId = 1;

const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const reply = (status, data) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  if (req.method === 'GET' && req.url === '/_sent') return reply(200, sent);
  if (req.method === 'POST' && req.url === '/_reset') {
    sent = [];
    failNext = 0;
    return reply(200, { ok: true });
  }
  if (req.method === 'POST' && req.url.startsWith('/_fail')) {
    failNext = Number(new URL(req.url, 'http://x').searchParams.get('count') || 1);
    return reply(200, { ok: true });
  }
  if (req.method === 'POST' && (req.url === '/emails' || req.url === '/emails/batch')) {
    if (!req.headers.authorization?.startsWith('Bearer ')) return reply(401, { message: 'Missing API key' });
    if (failNext > 0) {
      failNext -= 1;
      return reply(500, { message: 'Simulated Resend failure' });
    }
    const payload = JSON.parse(body);
    const emails = Array.isArray(payload) ? payload : [payload];
    if (emails.length > 100) return reply(422, { message: 'Too many emails in batch' });
    const ids = emails.map((email) => {
      const id = `fake-${nextId++}`;
      sent.push({ id, endpoint: req.url, idempotencyKey: req.headers['idempotency-key'] || null, ...email });
      return { id };
    });
    return reply(200, Array.isArray(payload) ? { data: ids } : ids[0]);
  }
  return reply(404, { message: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => console.log(`fake Resend listening on http://127.0.0.1:${PORT}`));
