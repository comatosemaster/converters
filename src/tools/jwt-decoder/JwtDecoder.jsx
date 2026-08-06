import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatJson } from '../json-formatter-validator/jsonUtils.js';
import { highlightJson } from '../json-formatter-validator/jsonHighlight.js';
import { validateTestTextFile, readTestTextFile } from '../regex-tester/regexUtils.js';
import {
  EXAMPLE_JWT,
  decodeJwt,
  parseClaims,
  formatTimestamp,
  getRelativeTime,
  getTokenStatus,
  TOKEN_STATUS_LABELS,
} from './jwtUtils.js';

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// All the actual decoding (Base64URL, structural validation, claims,
// timestamps, status) lives in jwtUtils.js - this file is just the UI
// wired up to it, re-run directly in the render body on every keystroke
// (no debouncing, per the "decode automatically while typing"
// requirement - matches how every other converter on this site works
// anyway). JSON pretty-printing and syntax highlighting reuse
// json-formatter-validator's formatJson()/highlightJson() directly, and
// the .txt drag-and-drop/upload handling reuses regex-tester's
// validateTestTextFile()/readTestTextFile() - both already fully generic,
// not regex- or JSON-formatter-specific in anything they actually do.

export default function JwtDecoder() {
  const fileInputRef = useRef(null);

  const [jwtInput, setJwtInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  // Holds a just-loaded example/file while we wait for the confirmation
  // above, if there's unsaved token text already.
  const [pendingContent, setPendingContent] = useState(null);

  const [copiedHeader, setCopiedHeader] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  useDocumentMeta({
    title: 'JWT Decoder & Inspector - Free & Client-Side | Rootconverter',
    description:
      'Decode and inspect JSON Web Tokens (JWT) instantly in your browser - header, payload, standard claims with plain-English explanations, expiration status, and timestamp conversion. Nothing is ever uploaded.',
  });

  const hasUnsavedWork = jwtInput.trim() !== '';
  useUnsavedChangesWarning(hasUnsavedWork);

  // Re-decodes on every keystroke - simple, and matches how the other
  // text tools on this site work.
  const decoded = decodeJwt(jwtInput);
  const claims = decoded.ok ? parseClaims(decoded.payload) : [];
  const status = jwtInput.trim() === '' ? null : decoded.ok ? getTokenStatus(decoded.payload) : 'invalid';

  // Bringing in an example or a file overwrites the whole input - if
  // there's unsaved work already, confirm first instead of silently
  // discarding it (same shape as RegexTester.jsx's loadNewContent).
  function loadNewContent(text) {
    if (hasUnsavedWork) {
      setPendingContent(text);
      setShowReplaceConfirm(true);
    } else {
      setJwtInput(text);
    }
  }

  function handleLoadExample() {
    loadNewContent(EXAMPLE_JWT);
  }

  async function loadFile(file) {
    const fileValidation = validateTestTextFile(file);
    if (!fileValidation.ok) {
      setFileError(fileValidation.error);
      return;
    }
    try {
      const text = await readTestTextFile(file);
      setFileError('');
      loadNewContent(text.trim());
    } catch {
      setFileError('Could not read that file.');
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) loadFile(file);
  }

  function handleFileInputChange(event) {
    const file = event.target.files[0];
    if (file) loadFile(file);
    event.target.value = ''; // lets picking the same file again re-trigger this
  }

  function handleClear() {
    setJwtInput('');
    setFileError('');
  }

  async function handleCopyHeader() {
    if (!decoded.ok) return;
    await navigator.clipboard.writeText(decoded.headerJson);
    setCopiedHeader(true);
    setTimeout(() => setCopiedHeader(false), 1500);
  }

  async function handleCopyPayload() {
    if (!decoded.ok) return;
    await navigator.clipboard.writeText(decoded.payloadJson);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 1500);
  }

  async function handleCopyToken() {
    if (!jwtInput.trim()) return;
    await navigator.clipboard.writeText(jwtInput.trim());
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 1500);
  }

  return (
    <div className="jwt-decoder">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      {showReplaceConfirm && (
        <ConfirmDialog
          title="Replace current token?"
          message="You have a JWT in the input already. Loading this will replace it."
          confirmLabel="Replace"
          onCancel={() => {
            setShowReplaceConfirm(false);
            setPendingContent(null);
          }}
          onConfirm={() => {
            setShowReplaceConfirm(false);
            setJwtInput(pendingContent ?? '');
            setPendingContent(null);
          }}
        />
      )}

      <p className="json-fix-report tool-privacy-note">
        <ShieldCheck size={15} aria-hidden="true" />
        JWTs are decoded entirely inside your browser. Nothing is uploaded or sent to any server.
      </p>

      <div className="converter-toolbar json-toolbar">
        <button type="button" className="ghost-button" onClick={handleCopyToken} disabled={!jwtInput.trim()}>
          {copiedToken ? 'Copied!' : 'Copy Entire JWT'}
        </button>
        <button type="button" className="ghost-button" onClick={() => fileInputRef.current?.click()}>
          Upload TXT
        </button>
        <button type="button" className="ghost-button" onClick={handleLoadExample}>
          Load Example JWT
        </button>
        <button type="button" className="ghost-button" onClick={handleClear}>
          Clear
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,text/plain"
          className="visually-hidden"
          onChange={handleFileInputChange}
        />
      </div>

      {fileError && <p className="field-error">{fileError}</p>}

      <div className="qr-layout jwt-layout">
        <div className="jwt-input-column">
          <div className="field">
            <label htmlFor="jwt-input">JWT</label>
            <div
              className={isDragging ? 'json-editor-wrapper dragging jwt-input-wrapper' : 'json-editor-wrapper jwt-input-wrapper'}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <div className="json-editor-body">
                <textarea
                  id="jwt-input"
                  className="json-editor-textarea"
                  value={jwtInput}
                  onChange={(event) => setJwtInput(event.target.value)}
                  spellCheck="false"
                  autoComplete="off"
                  placeholder="Paste a JWT here, or drop a .txt file… (header.payload.signature)"
                  aria-label="JWT input"
                />
              </div>
            </div>
          </div>

          {jwtInput.trim() === '' ? (
            <p className="field-hint">Paste a JWT above, upload a .txt file, or load the example to see it decoded.</p>
          ) : !decoded.ok ? (
            <p className="json-status json-status-invalid">✗ {decoded.error}</p>
          ) : (
            <p className="json-status json-status-valid">✓ Valid JWT structure</p>
          )}

          {status && (
            <p>
              <span className={`jwt-status-badge jwt-status-${status}`}>{TOKEN_STATUS_LABELS[status]}</span>
            </p>
          )}
        </div>

        <div className="jwt-output-column">
          {!decoded.ok ? (
            jwtInput.trim() !== '' && (
              <p className="field-hint">Fix the token above to see its decoded header, payload, and claims here.</p>
            )
          ) : (
            <>
              <div className="field">
                <div className="field-header">
                  <label>Header</label>
                  <button type="button" className="ghost-button" onClick={handleCopyHeader}>
                    {copiedHeader ? 'Copied!' : 'Copy Header JSON'}
                  </button>
                </div>
                <pre className="gradient-css-block">
                  {/* Safe: highlightJson() HTML-escapes every piece of the
                      original text before wrapping tokens in <span> - see
                      jsonHighlight.js. */}
                  <code dangerouslySetInnerHTML={{ __html: highlightJson(formatJson(decoded.header, 2)) }} />
                </pre>
              </div>

              <div className="field">
                <div className="field-header">
                  <label>Payload</label>
                  <button type="button" className="ghost-button" onClick={handleCopyPayload}>
                    {copiedPayload ? 'Copied!' : 'Copy Payload JSON'}
                  </button>
                </div>
                <pre className="gradient-css-block">
                  <code dangerouslySetInnerHTML={{ __html: highlightJson(formatJson(decoded.payload, 2)) }} />
                </pre>
              </div>

              {claims.length > 0 && (
                <div className="field">
                  <div className="field-header">
                    <label>Standard claims</label>
                  </div>
                  <div className="jwt-claims-grid">
                    {claims.map((claim) => {
                      const timestamp = claim.isTimestamp ? formatTimestamp(claim.value) : null;
                      return (
                        <div className="jwt-claim-card" key={claim.key}>
                          <div className="jwt-claim-card-header">
                            <span className="jwt-claim-label">{claim.label}</span>
                            <code className="jwt-claim-key">{claim.key}</code>
                          </div>
                          <p className="field-hint">{claim.explanation}</p>
                          {timestamp ? (
                            <dl className="comparison-meta">
                              <div>
                                <dt>Local</dt>
                                <dd>{timestamp.local}</dd>
                              </div>
                              <div>
                                <dt>UTC</dt>
                                <dd>{timestamp.utc}</dd>
                              </div>
                              <div>
                                <dt>Relative</dt>
                                <dd>{getRelativeTime(claim.value)}</dd>
                              </div>
                            </dl>
                          ) : (
                            <p className="jwt-claim-value">{JSON.stringify(claim.value)}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="field">
                <div className="field-header">
                  <label>Signature</label>
                </div>
                <pre className="gradient-css-block jwt-signature-block">
                  <code>{decoded.signature}</code>
                </pre>
                <p className="field-hint">
                  The signature isn't readable JSON - it's a cryptographic value used to verify the
                  token wasn't altered after it was issued. This tool only decodes the header and
                  payload; it never attempts to verify a signature, since that requires the
                  issuer's own secret or public key, which no client-side tool can safely have.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <article className="tool-article">
        <p>
          Whether you're debugging an authentication flow, inspecting an API token, or just
          learning how JWTs work, this tool decodes and inspects a JSON Web Token entirely in your
          browser - header, payload, standard claims with plain-English explanations, and
          expiration status - without ever sending the token anywhere.
        </p>

        <h2>What is a JWT?</h2>
        <p>
          A JSON Web Token (JWT, defined in RFC 7519) is a compact, URL-safe way to represent a set
          of claims - statements about a user or session - that can be verified because it's
          cryptographically signed. They're most commonly used as an authentication token: after
          you log in, a server issues a JWT that your browser sends back on future requests to
          prove who you are, without the server needing to look up a session on every single
          request.
        </p>

        <h2>JWT structure explained</h2>
        <p>
          A JWT is three Base64URL-encoded segments joined by periods:{' '}
          <code>header.payload.signature</code>. The header and payload are each just a JSON object
          encoded to text; the signature is a cryptographic value computed over the first two parts
          using an algorithm and secret/key chosen by whoever issued the token.
        </p>

        <h2>Header vs. payload vs. signature</h2>
        <ul>
          <li>
            <strong>Header</strong> - metadata about the token itself, almost always just which
            signing algorithm (<code>alg</code>) and token type (<code>typ</code>) were used.
          </li>
          <li>
            <strong>Payload</strong> - the actual claims: who the token is about, who issued it,
            when it expires, and any custom application-specific data the issuer chose to include.
          </li>
          <li>
            <strong>Signature</strong> - proof the header and payload haven't been tampered with
            since signing. It's the one part this tool can't decode into anything meaningful - see
            the Signature section above for why.
          </li>
        </ul>

        <h2>Standard JWT claims explained</h2>
        <ul>
          <li><strong>iss (Issuer)</strong> - the service or application that issued the token.</li>
          <li><strong>sub (Subject)</strong> - who or what the token is about, typically a user ID.</li>
          <li><strong>aud (Audience)</strong> - the intended recipient(s) of the token.</li>
          <li><strong>exp (Expiration Time)</strong> - when the token stops being valid.</li>
          <li><strong>nbf (Not Before)</strong> - when the token starts being valid.</li>
          <li><strong>iat (Issued At)</strong> - when the token was created.</li>
          <li><strong>jti (JWT ID)</strong> - a unique identifier for this specific token.</li>
        </ul>

        <h2>JWT security best practices</h2>
        <ul>
          <li>Always verify the signature server-side before trusting a token's contents - anyone can decode a JWT (as this tool does), but only the holder of the correct key can produce a valid signature for one.</li>
          <li>Always check <code>exp</code> server-side too - a decoded payload alone doesn't tell you whether the issuer's server would still accept the token.</li>
          <li>Never put secrets or sensitive data in a JWT payload - it's encoded, not encrypted, so anyone who has the token can read it, exactly like this tool just did.</li>
          <li>Prefer short expiration times paired with a refresh-token flow over long-lived tokens, to limit the damage if one is ever stolen.</li>
        </ul>

        <h2>Common mistakes</h2>
        <ul>
          <li>Confusing "decoded" with "verified" - this tool (and any JWT debugger) can read a token's contents without knowing whether the signature is genuine.</li>
          <li>Assuming <code>exp</code>/<code>nbf</code>/<code>iat</code> are in milliseconds - the JWT spec defines them as whole SECONDS since the Unix epoch, a common off-by-1000× bug.</li>
          <li>Storing a JWT in <code>localStorage</code> and assuming it's safe from XSS - an httpOnly cookie is generally the safer place for an authentication token.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Can this tool tell me if a JWT is genuine?</h3>
          <p>
            No - it can only decode and display the header and payload, which anyone can do without
            any key at all. Verifying authenticity requires checking the signature against the
            issuer's secret or public key, which this tool deliberately never asks for or has.
          </p>
        </div>
        <div className="faq-item">
          <h3>Why does the status say "Invalid JWT" for something that looks like a token?</h3>
          <p>
            A JWT must be exactly three Base64URL segments separated by periods, and both the
            header and payload must decode to valid JSON objects. If any of that isn't true - a
            missing segment, corrupted Base64, or malformed JSON - decoding fails and the token is
            reported as structurally invalid, regardless of the signature.
          </p>
        </div>
        <div className="faq-item">
          <h3>What does "Not Yet Valid" mean?</h3>
          <p>
            The token has an <code>nbf</code> (Not Before) claim set to a time still in the future -
            the issuer intentionally made this token unusable until that moment arrives.
          </p>
        </div>
        <div className="faq-item">
          <h3>Why are my timestamps off by exactly 1,000× or showing a nonsense date?</h3>
          <p>
            JWT timestamps are Unix SECONDS, not milliseconds - a payload that stores milliseconds
            instead (not spec-compliant, but it happens) will show a date far in the past or far
            in the future here, since that value is exactly 1,000× smaller than a real
            seconds-based timestamp would be.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my JWT uploaded anywhere?</h3>
          <p>
            No - decoding happens entirely in your browser using native Base64URL and JSON parsing;
            the token text is never transmitted anywhere.
          </p>
        </div>

        <h2>Related tools</h2>
        <p>
          Try the <Link to="/tool/base64-encoder-decoder">Base64 Encoder / Decoder</Link> or the{' '}
          <Link to="/tool/json-formatter-validator">JSON Formatter, Validator &amp; Fixer</Link>, or
          browse the rest of the <Link to="/category/developer">Developer tools</Link> on
          Rootconverter.
        </p>
      </article>
    </div>
  );
}
