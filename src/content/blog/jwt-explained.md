---
title: "JWT Explained: What JSON Web Tokens Are and How They Work"
slug: jwt-explained
category: developer
description: A practical explanation of JWT structure, signatures, bearer tokens, common validation mistakes, and when JSON Web Tokens are the wrong choice.
excerpt: JWTs are readable, signed containers for claims. Learn what the signature proves, what it does not hide, and how to avoid trusting the wrong part.
tags: [JWT, authentication, API security, JSON, bearer token]
author: Rootconverter
publishDate: 2026-08-08
difficulty: intermediate
seoTitle: "JWT Explained: Tokens, Signatures, and Sessions"
metaDescription: "JWT explained clearly: decode the three parts, understand JWT signatures, avoid common security mistakes, and choose tokens or sessions wisely."
relatedTools: [jwt-decoder, json-formatter-validator, base64-encoder-decoder]
---

## What a JWT is, in one sentence

A JSON Web Token, usually shortened to JWT, is a compact string that carries JSON claims and is often sent as a bearer token in an HTTP `Authorization` header.

A typical JWT has three dot-separated parts:

```text
header.payload.signature
```

The first part describes the token, the second part contains claims such as the user ID and expiry time, and the third part is a signature over the first two parts. That signature is the part that lets a receiver detect tampering.

A JWT is not a database session, not a login system, and not automatically encrypted. It is a token format. Your application still has to decide how tokens are issued, where they are stored, how long they live, what claims are accepted, and how revocation works.

The key point: you can read most JWT contents without a secret key, but reading a token is not the same as trusting it.

## Break the token apart: header, payload, signature

A JWT looks opaque at first because each section is encoded, but the structure is predictable:

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJleHAiOjE3MzU2ODk2MDB9.signature-here
```

Split it on dots and you get three segments:

| Segment | What it contains | Example fields |
|---|---|---|
| Header | Metadata about the token and signing algorithm | `alg`, `typ`, `kid` |
| Payload | Claims about the subject, issuer, audience, and timing | `sub`, `iss`, `aud`, `exp`, `iat`, `nbf` |
| Signature | A cryptographic signature over the encoded header and payload | Depends on the algorithm |

The header and payload are Base64URL-encoded JSON. Base64URL is a URL-safe variant of Base64 that commonly omits padding and uses URL-friendly characters. Encoding makes the data safe to put in headers and URLs; it does not make the data secret.

For example, a decoded payload might look like this:

```json
{
  "sub": "user_123",
  "iss": "https://auth.example.com",
  "aud": "billing-api",
  "exp": 1735689600,
  "iat": 1735686000
}
```

Common claims you will see:

- `sub`: the subject, often a user ID
- `iss`: the issuer that created the token
- `aud`: the intended audience, such as an API name
- `exp`: expiry time, usually as a Unix timestamp in seconds
- `iat`: issued-at time
- `nbf`: not-before time

If you want to inspect a token, paste it into the [JWT Decoder & Inspector](/tool/jwt-decoder). A decoder shows the readable header and payload so you do not have to guess where fields are hiding.

Decoding answers “what text is inside this token?” Verification answers “was this token signed by an issuer I trust, and is it still valid for this API?” Those are different questions.

## How a JWT is created and verified

A JWT is created by an issuer, usually an authentication server or identity provider. The issuer builds a header and payload, Base64URL-encodes both, joins them with a dot, and signs that exact string.

At a high level, the signed input is:

```text
base64url(header) + "." + base64url(payload)
```

The resulting token is:

```text
base64url(header).base64url(payload).signature
```

The receiver verifies the token by repeating the signing calculation with the expected key material and comparing the result with the signature from the token. If the signature matches and the claims pass validation, the receiver can use the token’s claims for authorization decisions.

There are two common signing families:

- Symmetric signing: the same secret is used to sign and verify. This is common with algorithms such as HMAC-based JWTs. Every service that can verify the token also has enough information to sign new tokens, so secret distribution matters.
- Asymmetric signing: a private key signs the token and a public key verifies it. This fits systems where one issuer signs tokens and multiple APIs verify them without holding the signing key.

Anyone who receives a JWT can Base64URL-decode the header and payload. That includes browser extensions, logs, proxies, and users. Only someone with the correct secret or private key should be able to produce a valid signature for a modified header and payload.

A signature failure usually means one of these things:

- The token was changed after signing.
- The verifier used the wrong secret or public key.
- The token came from a different issuer than expected.
- The algorithm or key ID does not match what the verifier allows.

Verification should not stop at the cryptographic signature. A correctly signed token can still be rejected because it is expired, not yet valid, issued by the wrong authority, or meant for a different audience.

## What JWTs are good for, and what they are not

JWTs work well when an API needs a portable, signed set of claims. A service can receive a token, verify the signature, check claims such as `aud` and `exp`, and make an authorization decision without calling a session database on every request.

Good uses include:

- Short-lived access tokens for APIs
- Passing identity claims between trusted services
- Federated login flows where an identity provider issues tokens to clients
- Service-to-service authorization where several APIs need to verify the same issuer

They are a poor place for secrets. A normal signed JWT is readable by design. If you put an email address, user ID, tenant ID, or role in the payload, assume anyone holding the token can read it. If the payload must be confidential, you need encryption or a different design.

Large payloads are another common problem. A JWT is sent on every authenticated request, often in a header like this:

```text
Authorization: Bearer eyJhbGciOi...
```

If you stuff profile data, feature flags, permissions, organization details, and preferences into the token, every request gets heavier. That cost repeats across HTML requests, API calls, retries, and background polling. The better rule is: include only the claims needed to verify and authorize the current request.

JWTs are also awkward as a permanent session store. Once issued, a stateless JWT can remain valid until it expires unless the verifier checks a revocation list, token version, session record, or other server-side state. Those checks can be the right tradeoff, but they reduce the simplicity people expect from stateless tokens.

A practical pattern is to use short-lived access tokens and keep refresh or session control somewhere you can revoke. The access token stays small and portable; the longer-lived state remains under server control.

## Common mistakes that cause JWT bugs

The most dangerous JWT mistake is trusting the decoded payload without verifying the signature. This is easy to do during debugging because the payload looks like ordinary JSON:

```js
const payload = JSON.parse(atob(token.split('.')[1]));
if (payload.role === 'admin') {
  allowAdminAction();
}
```

That code reads the token, but it does not prove the token was signed by your issuer. An attacker can create a new payload that says `role: admin`; without signature verification and claim validation, your application has no reason to trust it.

Storage choices create a different class of bugs. Long-lived bearer tokens are risky on shared devices and in places exposed to cross-site scripting. A bearer token works like a key: whoever presents it gets the access it grants. If malicious script can read it, the script can send it elsewhere or use it directly.

Frequent validation failures include:

- `exp` has passed, so the token is expired.
- `nbf` is in the future, often because of clock differences between systems.
- `aud` does not match the API receiving the token.
- `iss` does not match the trusted issuer.
- The key ID points to a key the verifier does not have.

Role and permission changes are another trap. If a token says `role: editor` and the user is demoted five minutes later, already-issued tokens do not change by themselves. You need short expiries, server-side checks, token versioning, or revocation logic if permission changes must take effect quickly.

If you are trying to read messy nested claims while debugging, paste the decoded payload into the [JSON Formatter, Validator & Fixer](/tool/json-formatter-validator). Clean formatting makes it easier to spot a wrong `aud`, stale `exp`, or unexpected issuer.

Do not choose JWTs when you need instant revocation, tight server-side session control, or secret payload contents. A regular server-side session is often simpler for those requirements.

## Try a real token and inspect it safely

Take a JWT from a development request and paste it into the [JWT Decoder & Inspector](/tool/jwt-decoder). You should see the header, payload, and signature separated instead of one long line.

Check the header first. Look for `alg` and, if present, `kid`. Then check the payload for the claims your API depends on: `sub`, `iss`, `aud`, `exp`, and any app-specific permissions.

A quick inspection workflow:

1. Copy the raw token without the `Bearer ` prefix.
2. Decode it and read the header and payload.
3. Compare the payload claims with the API that received the token.
4. Convert `exp` and `iat` timestamps if you need to confirm timing.
5. Treat the signature section as proof material, not readable JSON.

For plain Base64 experiments unrelated to JWT validation, the [Base64 Encoder / Decoder](/tool/base64-encoder-decoder) can help show the difference between encoding and encryption. JWTs use Base64URL for the header and payload, but the lesson is the same: encoded text is not hidden text.

Rootconverter tools run in your browser, so inspection does not require uploading a token to a server. That matters if you are debugging production-like data. Still, decoding is for inspection; it does not prove a token is valid. Your application or API must verify the signature and claims using trusted configuration.

## JWT vs session cookie: choose the right state model

JWTs and server-side sessions solve related problems with different tradeoffs. A JWT carries signed claims to the receiver. A server-side session usually carries a random session ID, and the server looks up the session data in storage.

| Choice | Strength | Cost |
|---|---|---|
| JWT access token | Portable claims; useful across services | Harder revocation; every request carries the claims |
| Server-side session | Easy invalidation and central control | Requires session storage lookup or shared session infrastructure |

Cookies do not change this distinction. A cookie can carry a session ID, a JWT, or another token. Cookie transport is about how the browser stores and sends the value. JWT is about the token format and signature.

Choose server-side sessions when you need easy logout, administrator-driven revocation, device-specific session management, or immediate permission changes. The server owns the session state, so it can delete or modify it at any time.

Choose JWTs when you need portable, verifiable claims across services, especially for short-lived API access tokens. They shine when multiple receivers need to trust the same issuer without calling a central session store for every request.

Replacing every session with a JWT is not automatically simpler or safer. If you add revocation lists, token version checks, refresh token storage, and permission lookups, you may have rebuilt server-side sessions with extra moving parts.

The right choice depends on what you need most: trust, portability, or control. JWTs give you signed portability. Sessions give you central control. Many real systems use both.