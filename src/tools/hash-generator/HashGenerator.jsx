import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatBytes } from '../../utils/formatBytes.js';
import {
  ALGORITHMS,
  MAX_FILE_SIZE,
  digest,
  guessAlgorithm,
  hmac,
  normalizeHash,
  toBase64,
  toHex,
} from './hashUtils.js';

const encoder = new TextEncoder();

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function HashGenerator() {
  const fileInputRef = useRef(null);

  const [source, setSource] = useState('text'); // 'text' | 'file'
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [fileBytes, setFileBytes] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);

  const [encoding, setEncoding] = useState('hex'); // 'hex' | 'base64'
  const [uppercase, setUppercase] = useState(false);
  const [useHmac, setUseHmac] = useState(false);
  const [hmacKey, setHmacKey] = useState('');
  const [compareWith, setCompareWith] = useState('');

  const [hashes, setHashes] = useState({}); // algorithm id -> Uint8Array
  const [isHashing, setIsHashing] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const input = source === 'text' ? encoder.encode(text) : fileBytes;
  const hasInput = source === 'text' ? true : Boolean(fileBytes);

  // Recompute every hash whenever the input or HMAC key changes. Hashing is
  // asynchronous (Web Crypto), so a newer run makes older ones discard
  // their results instead of overwriting fresh ones.
  const runRef = useRef(0);
  useEffect(() => {
    if (!hasInput) {
      setHashes({});
      return;
    }
    const run = ++runRef.current;
    setIsHashing(true);
    const keyBytes = encoder.encode(hmacKey);
    Promise.all(
      ALGORITHMS.map((a) => (useHmac ? hmac(a.id, keyBytes, input) : digest(a.id, input)).then((h) => [a.id, h])),
    )
      .then((pairs) => {
        if (run !== runRef.current) return;
        setHashes(Object.fromEntries(pairs));
        setError('');
      })
      .catch(() => {
        if (run === runRef.current) setError('Hashing failed in this browser. Make sure the page is loaded over HTTPS.');
      })
      .finally(() => {
        if (run === runRef.current) setIsHashing(false);
      });
    // `input` is derived from text/fileBytes, which are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, text, fileBytes, useHmac, hmacKey]);

  async function handleFile(selected) {
    if (!selected) return;
    if (selected.size > MAX_FILE_SIZE) {
      setError(`That file is too large to hash in the browser (over ${MAX_FILE_SIZE / (1024 * 1024)} MB).`);
      return;
    }
    setError('');
    setIsReadingFile(true);
    try {
      setFileBytes(new Uint8Array(await selected.arrayBuffer()));
      setFile(selected);
    } catch {
      setError('Could not read that file.');
    } finally {
      setIsReadingFile(false);
    }
  }

  function format(bytes) {
    if (!bytes) return '';
    if (encoding === 'base64') return toBase64(bytes);
    const hex = toHex(bytes);
    return uppercase ? hex.toUpperCase() : hex;
  }

  async function handleCopy(id) {
    await navigator.clipboard.writeText(format(hashes[id]));
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 1500);
  }

  // Checksum verification: which computed hash (if any) equals the pasted one.
  const expected = normalizeHash(compareWith, encoding);
  const matchId = expected
    ? ALGORITHMS.find((a) => hashes[a.id] && normalizeHash(format(hashes[a.id]), encoding) === expected)?.id
    : null;
  const guessed = expected && !matchId ? guessAlgorithm(compareWith) : null;

  return (
    <div className="hash-generator">
      <div className="mode-toggle" role="radiogroup" aria-label="What to hash">
        {[
          ['text', 'Text'],
          ['file', 'File'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={source === id}
            className={source === id ? 'mode-button active' : 'mode-button'}
            onClick={() => setSource(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {source === 'text' ? (
        <div className="field">
          <label htmlFor="hash-text">Text to hash</label>
          <textarea
            id="hash-text"
            rows={5}
            value={text}
            spellCheck={false}
            placeholder="Type or paste text - hashes update as you type"
            onChange={(event) => setText(event.target.value)}
          />
          <p className="field-hint">Text is hashed as UTF-8, exactly as typed - including spaces and line breaks.</p>
        </div>
      ) : (
        <div
          className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
          role="button"
          tabIndex={0}
          aria-label="Drag and drop, or click to choose a file to hash"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            handleFile(event.dataTransfer.files[0]);
          }}
        >
          <p className="drop-zone-title">
            {isReadingFile ? 'Reading file…' : file ? file.name : 'Drag & drop, or click to choose any file'}
          </p>
          <p className="drop-zone-hint">
            {file ? `${formatBytes(file.size)} - drop another file to replace it` : 'Verify downloads, ISOs, installers - up to 512 MB'}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            className="visually-hidden"
            aria-label="Choose a file to hash"
            onChange={(event) => {
              handleFile(event.target.files[0]);
              event.target.value = '';
            }}
          />
        </div>
      )}

      <div className="hash-options">
        <div className="mode-toggle" role="radiogroup" aria-label="Output encoding">
          {[
            ['hex', 'Hex'],
            ['base64', 'Base64'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={encoding === id}
              className={encoding === id ? 'mode-button active' : 'mode-button'}
              onClick={() => setEncoding(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={uppercase}
            disabled={encoding !== 'hex'}
            onChange={(event) => setUppercase(event.target.checked)}
          />
          Uppercase
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={useHmac} onChange={(event) => setUseHmac(event.target.checked)} />
          HMAC (with a secret key)
        </label>
      </div>

      {useHmac && (
        <div className="field">
          <label htmlFor="hash-hmac-key">Secret key</label>
          <input
            id="hash-hmac-key"
            type="text"
            value={hmacKey}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setHmacKey(event.target.value)}
            placeholder="The shared secret, as UTF-8 text"
          />
        </div>
      )}

      {error && <p className="field-error">{error}</p>}

      {hasInput && (
        <ul className="hash-results" aria-live="polite" aria-busy={isHashing}>
          {ALGORITHMS.map((algorithm) => (
            <li key={algorithm.id} className={matchId === algorithm.id ? 'hash-row hash-match' : 'hash-row'}>
              <div className="hash-row-header">
                <span className="hash-name">
                  {useHmac ? `HMAC-${algorithm.label}` : algorithm.label}
                  {algorithm.weak && <span className="hash-weak"> not for passwords or signatures</span>}
                </span>
                <button
                  type="button"
                  className="copy-button"
                  onClick={() => handleCopy(algorithm.id)}
                  disabled={!hashes[algorithm.id]}
                >
                  {copiedId === algorithm.id ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <code className="hash-value">{format(hashes[algorithm.id]) || '…'}</code>
            </li>
          ))}
        </ul>
      )}

      <div className="field">
        <label htmlFor="hash-compare">Compare with a checksum (optional)</label>
        <input
          id="hash-compare"
          type="text"
          value={compareWith}
          spellCheck={false}
          autoComplete="off"
          placeholder="Paste the hash published on the download page"
          onChange={(event) => setCompareWith(event.target.value)}
        />
        {expected && hasInput && (
          <p className={matchId ? 'hash-verdict hash-verdict-ok' : 'hash-verdict hash-verdict-bad'} aria-live="polite">
            {matchId
              ? `✓ Match - this is the ${useHmac ? 'HMAC-' : ''}${matchId} hash of your ${source === 'text' ? 'text' : 'file'}.`
              : guessed
                ? `✗ No match. That looks like a ${guessed} hash, but your ${source === 'text' ? 'text' : 'file'}'s ${guessed} is different - the data has changed, or the checksum belongs to something else.`
                : '✗ No match with any of the hashes above.'}
          </p>
        )}
      </div>

      <article className="tool-article">
        <p>
          A hash is a short fingerprint of some data: the same input always produces the same hash,
          and changing even one character produces a completely different one. This tool calculates
          MD5, SHA-1, SHA-256, SHA-384 and SHA-512 hashes of text or files right in your browser -
          nothing is uploaded.
        </p>

        <h2>Verifying a download</h2>
        <ol>
          <li>Switch to <strong>File</strong> and drop the file you downloaded.</li>
          <li>Paste the checksum published by the software&apos;s website into <strong>Compare with a checksum</strong>.</li>
          <li>A green match means your file is exactly what the publisher released - not corrupted or tampered with.</li>
        </ol>

        <h2>Which algorithm should I use?</h2>
        <ul>
          <li><strong>SHA-256</strong> is the everyday standard for checksums, APIs and certificates.</li>
          <li><strong>SHA-384 / SHA-512</strong> give longer hashes; SHA-512 is also often faster on 64-bit computers.</li>
          <li><strong>MD5 and SHA-1</strong> are broken for security - attackers can create two different inputs with the same hash - but they&apos;re still fine for spotting accidental corruption and matching old checksums.</li>
        </ul>
        <p>
          Hashes are not encryption: you can&apos;t &quot;decode&quot; a hash back into the original.
          And for storing passwords, use a slow, salted algorithm such as bcrypt or Argon2, not any
          of these fast hashes.
        </p>

        <h2>What is HMAC?</h2>
        <p>
          HMAC combines a hash with a secret key. Only someone who knows the key can produce the same
          value, which is why services use it to sign API requests and webhooks. Enter the shared
          secret to calculate or check such a signature.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Why does my hash differ from another tool&apos;s?</h3>
          <p>Usually invisible differences in the input: a trailing newline, Windows vs Unix line endings, or a different text encoding. This tool hashes your text as UTF-8 exactly as typed.</p>
        </div>
        <div className="faq-item">
          <h3>Is my file uploaded?</h3>
          <p>No. The file is read and hashed on your device; SHA hashes use your browser&apos;s built-in Web Crypto engine.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Encode data with the <Link to="/tool/base64-encoder-decoder">Base64 Encoder/Decoder</Link>,
          inspect tokens with the <Link to="/tool/jwt-decoder">JWT Decoder</Link>, or create random IDs
          with the <Link to="/tool/uuid-generator">UUID Generator</Link>.
        </p>
      </article>
    </div>
  );
}
