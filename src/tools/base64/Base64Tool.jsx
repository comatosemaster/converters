import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';

// --- Encode/decode helpers -------------------------------------------------
//
// We don't use the plain `btoa(text)` / `atob(text)` calls directly, because
// btoa only understands single-byte (Latin1) characters. If the user types
// an emoji or an accented letter, plain btoa throws an error. To support any
// text, we first convert the string to raw UTF-8 bytes ourselves, and only
// hand btoa/atob the byte-safe version they expect.

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text); // string -> UTF-8 bytes
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary); // bytes -> Base64 string
}

function decodeBase64(base64Text) {
  const binary = atob(base64Text); // Base64 string -> bytes (throws if invalid)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes); // UTF-8 bytes -> string
}

// --- The tool component -----------------------------------------------------
//
// Note: this component only renders its own input/output UI. It does NOT
// wrap itself in <ToolLayout> — the router (see src/pages/ToolPage.jsx) does
// that automatically using the name/description from the registry. That's
// what keeps future tool files this small.

export default function Base64Tool() {
  const [mode, setMode] = useState('encode'); // 'encode' or 'decode'
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  // Remembers the exact input text at the moment it was last copied, so we
  // can tell "already copied this" apart from "changed since copying".
  const [savedInput, setSavedInput] = useState(null);

  useDocumentMeta({
    title: 'Base64 Encoder / Decoder — Free & Client-Side | Toolbox',
    description:
      'Encode text to Base64 or decode Base64 back to readable text, instantly and entirely in your browser. No upload, no tracking.',
  });

  // Compute the output fresh every render — simple and always in sync.
  let output = '';
  if (input) {
    try {
      output = mode === 'encode' ? encodeBase64(input) : decodeBase64(input);
      if (error) setError('');
    } catch {
      // Only decoding can fail (input wasn't valid Base64).
      output = '';
      if (!error) setError('That doesn’t look like valid Base64 text.');
    }
  } else if (error) {
    setError('');
  }

  function handleSwap() {
    // Flip direction and carry the current output over as the new input,
    // so you can bounce back and forth between encode and decode.
    setMode(mode === 'encode' ? 'decode' : 'encode');
    setInput(output);
  }

  async function handleCopy() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setSavedInput(input); // this input's result is now safely copied out
    setTimeout(() => setCopied(false), 1500);
  }

  // "Unsaved work" here means: there's text in the box, and it's not the
  // exact text whose result was last copied. Warn on the former, not the
  // latter — once you've copied the result, closing the tab is fine.
  const hasUnsavedWork = input.length > 0 && input !== savedInput;
  useUnsavedChangesWarning(hasUnsavedWork);

  return (
    <div className="base64-tool">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      <div className="mode-toggle" role="radiogroup" aria-label="Direction">
        <button
          type="button"
          className={mode === 'encode' ? 'mode-button active' : 'mode-button'}
          aria-pressed={mode === 'encode'}
          onClick={() => setMode('encode')}
        >
          Encode
        </button>
        <button
          type="button"
          className={mode === 'decode' ? 'mode-button active' : 'mode-button'}
          aria-pressed={mode === 'decode'}
          onClick={() => setMode('decode')}
        >
          Decode
        </button>
        <button
          type="button"
          className="swap-button"
          onClick={handleSwap}
          title="Swap direction and reuse the result as input"
        >
          &#8646; Swap
        </button>
      </div>

      <div className="field">
        <label htmlFor="base64-input">
          {mode === 'encode' ? 'Text to encode' : 'Base64 to decode'}
        </label>
        <textarea
          id="base64-input"
          rows={6}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            mode === 'encode' ? 'Type or paste plain text here…' : 'Paste Base64 text here…'
          }
        />
      </div>

      <div className="field">
        <div className="field-header">
          <label htmlFor="base64-output">
            {mode === 'encode' ? 'Base64 result' : 'Decoded text'}
          </label>
          <button
            type="button"
            className="copy-button"
            onClick={handleCopy}
            disabled={!output}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <textarea id="base64-output" rows={6} value={output} readOnly placeholder="Result will appear here" />
        {error && <p className="field-error">{error}</p>}
      </div>

      <article className="tool-article">
        <p>
          Base64 turns arbitrary bytes — text, but also images, files, or anything else — into a
          string using only 64 printable characters, so it can safely travel through channels
          that only understand plain text: URLs, JSON, email, config files, and more. This tool
          encodes and decodes it instantly, entirely in your browser.
        </p>

        <h2>How it works</h2>
        <p>
          Encoding first converts your text into raw UTF-8 bytes, then maps every 3 bytes onto 4
          Base64 characters (A–Z, a–z, 0–9, <code>+</code>, <code>/</code>). Decoding reverses
          that: Base64 characters back to bytes, then bytes back to text. Both directions run
          using your browser's own <code>btoa</code>/<code>atob</code> functions — nothing is
          sent anywhere to do it.
        </p>

        <h2>Base64 is not encryption</h2>
        <p>
          It's easy to mistake Base64 for a security measure because the output looks scrambled,
          but it isn't — it's just a different way of writing the same data, and anyone can decode
          it instantly with no key or password. Don't use it to hide sensitive information; use it
          only when you need text-safe data, not secret data.
        </p>

        <h2>When to use it</h2>
        <ul>
          <li>Embedding small binary data (like an image) inside JSON, XML, or a URL.</li>
          <li>Working with APIs that require Base64-encoded request or response bodies.</li>
          <li>Reading data: URIs, email attachments, or JWT tokens, which are Base64 under the hood.</li>
        </ul>

        <h2>Common mistakes</h2>
        <ul>
          <li>Assuming Base64 provides privacy or security — it doesn't, see above.</li>
          <li>
            Feeding plain text with special characters straight through <code>btoa()</code>{' '}
            in JavaScript without handling UTF-8 first — this tool does that conversion for you
            automatically, so emoji and accented letters round-trip correctly.
          </li>
          <li>Pasting truncated or whitespace-mangled Base64 (e.g. from a line-wrapped email) and expecting it to decode cleanly.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Is Base64 encryption?</h3>
          <p>No — it's an encoding, not a cipher. Anyone can decode it with no key required.</p>
        </div>
        <div className="faq-item">
          <h3>Why does my decoded text look garbled?</h3>
          <p>
            Usually because the original Base64 was incomplete or altered (e.g. truncated by
            another tool, or line breaks/whitespace inserted) — decoding partial or corrupted
            Base64 produces partial or corrupted output.
          </p>
        </div>
        <div className="faq-item">
          <h3>Why is the encoded text longer than my original text?</h3>
          <p>
            Base64 represents every 3 bytes as 4 characters, so the output is roughly a third
            larger than the input — that overhead is the cost of making binary-safe data
            text-safe.
          </p>
        </div>
        <div className="faq-item">
          <h3>Can I encode more than text, like images?</h3>
          <p>
            Yes, Base64 works on any bytes — see the{' '}
            <Link to="/tool/image-to-base64">Image to Base64</Link> tool if that's specifically
            what you need.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my text uploaded anywhere?</h3>
          <p>No. Encoding and decoding both happen entirely in your browser.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Browse the rest of the <Link to="/category/text-data">Text &amp; Data tools</Link> on
          Toolbox.
        </p>
      </article>
    </div>
  );
}
