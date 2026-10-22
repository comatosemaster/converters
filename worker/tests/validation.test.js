import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidEmail,
  isWellFormedToken,
  normalizeEmail,
  normalizeSource,
  validateToolRequest,
} from '../lib/validation.js';
import { hashIp, randomToken } from '../lib/crypto.js';

test('emails: accepts normal addresses', () => {
  for (const email of ['a@b.co', 'first.last+tag@example.com', 'x_y-z@sub.domain.ge', 'user@xn--80ak6aa92e.com']) {
    assert.equal(isValidEmail(email), true, email);
  }
});

test('emails: rejects malformed addresses', () => {
  for (const email of [
    '',
    'plain',
    '@example.com',
    'a@b',
    'a@b.c',
    'a b@example.com',
    'a@@example.com',
    '.a@example.com',
    'a.@example.com',
    'a..b@example.com',
    'a@-example.com',
    'a@example-.com',
    `${'x'.repeat(65)}@example.com`,
    `a@${'x'.repeat(250)}.com`,
    'a@example.com\nBcc: victim@example.com',
  ]) {
    assert.equal(isValidEmail(email), false, JSON.stringify(email));
  }
});

test('emails: normalized to trimmed lower case', () => {
  assert.equal(normalizeEmail('  Me@Example.COM '), 'me@example.com');
  assert.equal(normalizeEmail(42), '');
});

test('sources: short slugs kept, anything else becomes "other"', () => {
  assert.equal(normalizeSource('footer'), 'footer');
  assert.equal(normalizeSource('blog-post'), 'blog-post');
  assert.equal(normalizeSource('<script>'), 'other');
  assert.equal(normalizeSource(undefined), 'other');
  assert.equal(normalizeSource('x'.repeat(33)), 'other');
});

test('tool requests: length limits and email rules', () => {
  assert.equal(validateToolRequest({ description: 'too short' }).ok, false);
  assert.equal(validateToolRequest({ description: 'x'.repeat(1001) }).ok, false);
  assert.equal(validateToolRequest({ description: 'Convert HEIC to PNG', details: 'y'.repeat(1001) }).ok, false);
  assert.equal(validateToolRequest({ description: 'Convert HEIC to PNG', email: 'nope' }).ok, false);
  // Asking to be notified needs an address.
  assert.equal(validateToolRequest({ description: 'Convert HEIC to PNG', notify: true }).ok, false);

  const ok = validateToolRequest({ description: '  Convert HEIC to PNG  ', details: '', email: ' Me@Example.com ', notify: 'on' });
  assert.deepEqual(ok, { ok: true, value: { description: 'Convert HEIC to PNG', details: null, email: 'me@example.com', notify: true } });
  // The checkbox is unchecked by default: an email alone doesn't subscribe anyone.
  assert.equal(validateToolRequest({ description: 'Convert HEIC to PNG', email: 'a@b.co' }).value.notify, false);
});

test('tokens: 256-bit, URL-safe, unique', () => {
  const tokens = new Set(Array.from({ length: 1000 }, randomToken));
  assert.equal(tokens.size, 1000);
  for (const token of tokens) assert.equal(isWellFormedToken(token), true, token);
  assert.equal(isWellFormedToken('short'), false);
  assert.equal(isWellFormedToken(`${randomToken().slice(0, 42)}!`), false);
  assert.equal(isWellFormedToken(undefined), false);
});

test('IP hashing: salted, stable, never the raw IP', async () => {
  const a = await hashIp('203.0.113.7', 'salt-1');
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, await hashIp('203.0.113.7', 'salt-1'));
  assert.notEqual(a, await hashIp('203.0.113.7', 'salt-2'));
  assert.notEqual(a, await hashIp('203.0.113.8', 'salt-1'));
  assert.ok(!a.includes('203'));
});
