// Tokens and hashing, using the Web Crypto API (available both in the
// Worker runtime and in Node 20+, so the unit tests use the same code).

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 256 random bits as a 43-character URL-safe string - unguessable. */
export function randomToken() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * The visitor's IP is never stored. A salted SHA-256 of it is, so repeated
 * abuse from one address can be limited without keeping the address. The
 * salt is a secret (IP_HASH_SALT): without it, the 4 billion possible IPv4
 * addresses could simply be hashed and looked up.
 */
export async function hashIp(ip, salt) {
  const data = new TextEncoder().encode(`${salt}:${ip || 'unknown'}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}
