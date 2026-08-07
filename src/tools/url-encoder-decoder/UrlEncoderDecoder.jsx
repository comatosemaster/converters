import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { validateTestTextFile, readTestTextFile } from '../regex-tester/regexUtils.js';
import { OPERATIONS, DEFAULT_OPERATION, EXAMPLES, processText, swapDirection } from './urlEncodeUtils.js';

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// All the actual encoding/decoding lives in urlEncodeUtils.js, built on
// the browser's native encodeURIComponent()/decodeURIComponent() - this
// file is just the UI wired up to it, re-run directly in the render body
// on every keystroke (no debouncing, matching the "update automatically
// while typing" requirement and how the other text tools on this site
// work). The .txt drag-and-drop/upload handling reuses regex-tester's
// validateTestTextFile()/readTestTextFile() directly - both already
// fully generic, not regex-specific in anything they actually do.

export default function UrlEncoderDecoder() {
  const fileInputRef = useRef(null);

  const [operation, setOperation] = useState(DEFAULT_OPERATION);
  const [input, setInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [pendingContent, setPendingContent] = useState(null);
  const [copied, setCopied] = useState(false);

  useDocumentMeta({
    title: 'URL Encoder / Decoder - Free & Client-Side | Rootconverter',
    description:
      'Encode and decode URLs and text using standard percent encoding, instantly in your browser using native JavaScript APIs. Nothing is ever uploaded.',
  });

  // Re-processes on every keystroke - simple, and matches how the other
  // text tools on this site work.
  const result = processText(input, operation);

  const hasUnsavedWork = input.trim() !== '' || operation !== DEFAULT_OPERATION;
  useUnsavedChangesWarning(hasUnsavedWork);

  function loadNewContent(text, nextOperation = 'encode') {
    if (hasUnsavedWork) {
      setPendingContent({ text, operation: nextOperation });
      setShowReplaceConfirm(true);
    } else {
      setInput(text);
      setOperation(nextOperation);
    }
  }

  function handleLoadExample(example) {
    loadNewContent(example.original, 'encode');
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
      loadNewContent(text, operation);
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
    event.target.value = '';
  }

  function handleSwap() {
    // Carries the current OUTPUT over as the new input and flips
    // direction, so a completed encode/decode can be immediately
    // reversed - same idea as Base64Tool.jsx's own Swap button.
    if (!result.ok || !result.value) return;
    setInput(result.value);
    setOperation(swapDirection(operation));
  }

  function handleClear() {
    setInput('');
    setOperation(DEFAULT_OPERATION);
    setFileError('');
    setCopied(false);
  }

  async function handleCopy() {
    if (!result.ok || !result.value) return;
    await navigator.clipboard.writeText(result.value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="url-encoder-decoder">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      {showReplaceConfirm && (
        <ConfirmDialog
          title="Replace current text?"
          message="You have unsaved text in the input already. Loading this will replace it."
          confirmLabel="Replace"
          onCancel={() => {
            setShowReplaceConfirm(false);
            setPendingContent(null);
          }}
          onConfirm={() => {
            setShowReplaceConfirm(false);
            setInput(pendingContent?.text ?? '');
            setOperation(pendingContent?.operation ?? DEFAULT_OPERATION);
            setPendingContent(null);
          }}
        />
      )}

      <div className="mode-toggle" role="radiogroup" aria-label="Operation">
        {OPERATIONS.map((op) => (
          <button
            key={op.id}
            type="button"
            aria-pressed={op.id === operation}
            className={op.id === operation ? 'mode-button active' : 'mode-button'}
            onClick={() => setOperation(op.id)}
          >
            {op.label}
          </button>
        ))}
        <button type="button" className="swap-button" onClick={handleSwap} disabled={!result.ok || !result.value}>
          &#8646; Swap
        </button>
      </div>

      <div className="converter-toolbar json-toolbar">
        <button type="button" className="ghost-button" onClick={handleCopy} disabled={!result.ok || !result.value}>
          {copied ? 'Copied!' : 'Copy Output'}
        </button>
        <button type="button" className="ghost-button" onClick={() => fileInputRef.current?.click()}>
          Upload TXT
        </button>
        {EXAMPLES.map((example) => (
          <button key={example.label} type="button" className="ghost-button" onClick={() => handleLoadExample(example)}>
            Example: {example.label}
          </button>
        ))}
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

      <div className="qr-layout url-encode-layout">
        <div className="field">
          <label htmlFor="url-input">{operation === 'encode' ? 'Text to encode' : 'Text to decode'}</label>
          <div
            className={isDragging ? 'json-editor-wrapper dragging url-encode-wrapper' : 'json-editor-wrapper url-encode-wrapper'}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="json-editor-body">
              <textarea
                id="url-input"
                className="json-editor-textarea url-encode-textarea"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                spellCheck="false"
                autoComplete="off"
                placeholder={
                  operation === 'encode' ? 'Type or paste plain text here…' : 'Type or paste percent-encoded text here…'
                }
                aria-label={operation === 'encode' ? 'Text to encode' : 'Text to decode'}
              />
            </div>
          </div>
          <p className="field-hint">{input.length.toLocaleString()} characters</p>
        </div>

        <div className="field">
          <label htmlFor="url-output">{operation === 'encode' ? 'Encoded result' : 'Decoded result'}</label>
          <div className="json-editor-wrapper url-encode-wrapper">
            <div className="json-editor-body">
              <textarea
                id="url-output"
                className="json-editor-textarea url-encode-textarea"
                value={result.ok ? result.value : ''}
                readOnly
                spellCheck="false"
                placeholder="Result will appear here…"
                aria-label={operation === 'encode' ? 'Encoded result' : 'Decoded result'}
              />
            </div>
          </div>
          {!result.ok && result.error && <p className="field-error">{result.error}</p>}
          <p className="field-hint">{(result.ok ? result.value.length : 0).toLocaleString()} characters</p>
        </div>
      </div>

      <div className="comparison-panel">
        <dl className="comparison-meta">
          <div>
            <dt>Operation</dt>
            <dd>{operation === 'encode' ? 'Encode' : 'Decode'}</dd>
          </div>
          <div>
            <dt>Input length</dt>
            <dd>{input.length.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Output length</dt>
            <dd>{(result.ok ? result.value.length : 0).toLocaleString()}</dd>
          </div>
        </dl>
      </div>

      <article className="tool-article">
        <p>
          Whether you're building a query string, debugging a link that broke because of a stray
          space or ampersand, or just trying to read what a percent-encoded URL actually says, this
          tool encodes and decodes text using standard percent encoding - instantly, entirely in
          your browser, using the same native APIs your own code would call.
        </p>

        <h2>What is URL encoding?</h2>
        <p>
          URL encoding (percent encoding) replaces characters that aren't safe to use directly in a
          URL - spaces, <code>&amp;</code>, <code>=</code>, non-ASCII letters, and more - with a{' '}
          <code>%</code> followed by two hex digits representing that character's byte value, so{' '}
          <code>Hello World!</code> becomes <code>Hello%20World%21</code>. It exists because a URL
          has its own reserved punctuation (like <code>&amp;</code> and <code>=</code> separating
          query parameters) that would otherwise be ambiguous if it appeared inside a value too.
        </p>

        <h2>Common use cases</h2>
        <ul>
          <li>Building a query string parameter that might contain spaces, symbols, or user-typed text.</li>
          <li>Safely embedding a URL (as a value) inside another URL, like a redirect or callback parameter.</li>
          <li>Debugging a broken link by decoding it back into something readable.</li>
          <li>Preparing text for an API that expects <code>application/x-www-form-urlencoded</code> data.</li>
        </ul>

        <h2>encodeURI() vs. encodeURIComponent()</h2>
        <p>
          JavaScript actually has two native encoding functions, and mixing them up is a common
          source of bugs. <code>encodeURI()</code> is meant for encoding a WHOLE URL, so it leaves
          characters like <code>:</code>, <code>/</code>, <code>?</code>, <code>&amp;</code>, and{' '}
          <code>=</code> untouched (they're structurally meaningful in a full URL).{' '}
          <code>encodeURIComponent()</code> - what this tool uses - is meant for encoding a single
          VALUE that will be placed inside a URL (like one query parameter), so it encodes those
          same characters too, since inside a single value they're just data, not structure.
          Using <code>encodeURI()</code> on a query parameter value would fail to escape a{' '}
          <code>&amp;</code> or <code>=</code> the value happens to contain, silently corrupting the
          URL's structure.
        </p>

        <h2>Examples of URL encoding</h2>
        <ul>
          <li><code>Hello World!</code> → <code>Hello%20World%21</code></li>
          <li><code>name=John &amp; age=25</code> → <code>name%3DJohn%20%26%20age%3D25</code></li>
          <li><code>café</code> → <code>caf%C3%A9</code></li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Why does encoding "!" turn it into %21 here, but not everywhere?</h3>
          <p>
            JavaScript's own <code>encodeURIComponent()</code> deliberately leaves five characters
            unescaped (<code>! ' ( ) *</code>), a quirk left over from an older URI specification.
            This tool adds one extra pass to escape those too, giving fully strict percent-encoding
            - the more common expectation for a general-purpose "URL encode" tool.
          </p>
        </div>
        <div className="faq-item">
          <h3>Why did decoding fail with an error?</h3>
          <p>
            The text wasn't validly percent-encoded - usually a stray <code>%</code> not followed by
            two hex digits, or a truncated multi-byte sequence (common when encoded text gets cut
            off mid-copy). Fix the encoded text and it'll decode automatically.
          </p>
        </div>
        <div className="faq-item">
          <h3>What does the Swap button do?</h3>
          <p>
            It moves the current result into the input box and flips the operation, so you can
            immediately verify a round trip - encode something, hit Swap, and decoding it should
            give back exactly what you started with.
          </p>
        </div>
        <div className="faq-item">
          <h3>Can I encode a whole URL, not just one value?</h3>
          <p>
            This tool is built for encoding a single value (a query parameter, a path segment) with{' '}
            <code>encodeURIComponent()</code> - see "encodeURI() vs. encodeURIComponent()" above for
            why encoding an entire URL needs a different, less aggressive function that leaves the
            URL's own structural characters alone.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my text uploaded anywhere?</h3>
          <p>No - encoding and decoding both happen entirely in your browser; nothing is ever sent anywhere.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Try the <Link to="/tool/base64-encoder-decoder">Base64 Encoder / Decoder</Link>, or browse
          the rest of the <Link to="/category/developer">Developer tools</Link> on Rootconverter.
        </p>
      </article>
    </div>
  );
}
