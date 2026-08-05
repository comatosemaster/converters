import { useState } from 'react';

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
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="base64-tool">
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
    </div>
  );
}
