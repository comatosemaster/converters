import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';
import JsonTreeView from './JsonTreeView.jsx';
import { highlightJson } from './jsonHighlight.js';
import {
  validateJson,
  validateJsonFile,
  readJsonFile,
  formatJson,
  minifyJson,
  findDuplicateKeys,
  calculateJsonStats,
  describeFixes,
} from './jsonUtils.js';

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// The actual parsing/formatting/stats logic lives in jsonUtils.js - this
// file is just the UI wired up to it.

export default function JsonFormatter() {
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const gutterRef = useRef(null);
  const highlightRef = useRef(null);

  const [rawInput, setRawInput] = useState('');
  const [indent, setIndent] = useState('2'); // '2' | '4' | 'tab'
  const [autoFormat, setAutoFormat] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState('');

  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  // Holds a just-loaded file's text while we wait for the replace
  // confirmation above.
  const [pendingContent, setPendingContent] = useState(null);

  const [copiedFormatted, setCopiedFormatted] = useState(false);
  const [copiedMinified, setCopiedMinified] = useState(false);
  const [formattedBlobUrl, setFormattedBlobUrl] = useState('');
  const [minifiedBlobUrl, setMinifiedBlobUrl] = useState('');

  const [isFixing, setIsFixing] = useState(false);
  const [fixReport, setFixReport] = useState(null); // array of strings, or null
  const [fixError, setFixError] = useState('');

  // Re-parses on every change - simple, and matches how the other text
  // tools on this site work (no debouncing). Fine for anything up to a
  // few MB; a very large document could feel less snappy while typing.
  const validation = rawInput.trim() ? validateJson(rawInput) : null;
  const duplicateKeys = validation?.ok ? findDuplicateKeys(rawInput) : [];
  const stats = validation?.ok ? calculateJsonStats(rawInput, validation.value) : null;
  const indentValue = indent === 'tab' ? '\t' : Number(indent);
  const formattedText = validation?.ok ? formatJson(validation.value, indentValue) : '';
  const minifiedText = validation?.ok ? minifyJson(validation.value) : '';

  // Builds downloadable .json files for both outputs whenever the valid
  // JSON or indentation changes.
  useEffect(() => {
    if (!validation?.ok) {
      setFormattedBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      setMinifiedBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      return;
    }
    const formattedUrl = URL.createObjectURL(new Blob([formattedText], { type: 'application/json' }));
    const minifiedUrl = URL.createObjectURL(new Blob([minifiedText], { type: 'application/json' }));
    setFormattedBlobUrl(formattedUrl);
    setMinifiedBlobUrl(minifiedUrl);
    return () => {
      URL.revokeObjectURL(formattedUrl);
      URL.revokeObjectURL(minifiedUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validation?.ok, formattedText, minifiedText]);

  function handleBlur() {
    // Auto-format snaps the editor to pretty-printed form once you click
    // away, rather than fighting your cursor on every keystroke.
    if (autoFormat && validation?.ok) {
      setRawInput(formatJson(validation.value, indentValue));
    }
  }

  function handleFormatClick() {
    if (validation?.ok) setRawInput(formattedText);
  }

  function handleMinifyClick() {
    if (validation?.ok) setRawInput(minifiedText);
  }

  function handleClear() {
    setRawInput('');
    setFileError('');
    setFixReport(null);
    setFixError('');
  }

  async function handleFixClick() {
    if (!rawInput.trim() || validation?.ok) return;

    setIsFixing(true);
    setFixError('');
    setFixReport(null);

    try {
      // jsonrepair is only needed here, so it's imported dynamically rather
      // than bundled into every page's initial download.
      const { jsonrepair } = await import('jsonrepair');
      const repairedText = jsonrepair(rawInput);
      const repairedValidation = validateJson(repairedText);

      if (!repairedValidation.ok) {
        setFixError("Couldn't automatically fix this JSON - some of the errors are too severe to repair.");
        return;
      }

      setFixReport(describeFixes(rawInput, repairedText));
      setRawInput(formatJson(repairedValidation.value, indentValue));
    } catch {
      setFixError("Couldn't automatically fix this JSON - some of the errors are too severe to repair.");
    } finally {
      setIsFixing(false);
    }
  }

  async function loadFile(file) {
    const fileValidation = validateJsonFile(file);
    if (!fileValidation.ok) {
      setFileError(fileValidation.error);
      return;
    }

    try {
      const text = await readJsonFile(file);
      setFileError('');
      // Loading a file overwrites the whole editor - if there's unsaved
      // work already, confirm first instead of silently discarding it.
      if (hasUnsavedWork) {
        setPendingContent(text);
        setShowReplaceConfirm(true);
      } else {
        setRawInput(text);
      }
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

  async function handleCopyFormatted() {
    if (!formattedText) return;
    await navigator.clipboard.writeText(formattedText);
    setCopiedFormatted(true);
    setTimeout(() => setCopiedFormatted(false), 1500);
  }

  async function handleCopyMinified() {
    if (!minifiedText) return;
    await navigator.clipboard.writeText(minifiedText);
    setCopiedMinified(true);
    setTimeout(() => setCopiedMinified(false), 1500);
  }

  // Any non-empty editor content counts as unsaved work - only Clear
  // resets it, matching this tool's own spec (formatting/minifying/
  // copying/downloading all keep it "unsaved" since they don't change
  // whether there's content worth protecting).
  const hasUnsavedWork = rawInput.trim().length > 0;
  useUnsavedChangesWarning(hasUnsavedWork);

  const lines = rawInput.split('\n');
  // A trailing space keeps the overlay's last line from collapsing to zero
  // height when the document ends right after a newline.
  const highlightedHtml = `${highlightJson(rawInput)} `;

  return (
    <div className="json-formatter">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      {showReplaceConfirm && (
        <ConfirmDialog
          title="Replace current JSON?"
          message="You have unsaved JSON in the editor. Loading this file will replace it."
          confirmLabel="Replace"
          onCancel={() => {
            setShowReplaceConfirm(false);
            setPendingContent(null);
          }}
          onConfirm={() => {
            setShowReplaceConfirm(false);
            setRawInput(pendingContent ?? '');
            setPendingContent(null);
          }}
        />
      )}

      <div className="converter-toolbar json-toolbar">
        <button type="button" className="mode-button" onClick={handleFormatClick} disabled={!validation?.ok}>
          Format
        </button>
        <button type="button" className="mode-button" onClick={handleMinifyClick} disabled={!validation?.ok}>
          Minify
        </button>
        <button
          type="button"
          className="mode-button fix-button"
          onClick={handleFixClick}
          disabled={!rawInput.trim() || validation?.ok || isFixing}
          title="Attempt to automatically repair common JSON syntax errors"
        >
          {isFixing ? 'Fixing…' : '🩹 Fix JSON'}
        </button>
        <button type="button" className="ghost-button" onClick={() => fileInputRef.current?.click()}>
          Upload JSON
        </button>
        <button type="button" className="ghost-button" onClick={handleClear}>
          Clear
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          onChange={handleFileInputChange}
        />
      </div>

      <div className="json-options-row">
        <div className="field">
          <label htmlFor="json-indent">Indentation</label>
          <select id="json-indent" value={indent} onChange={(event) => setIndent(event.target.value)}>
            <option value="2">2 spaces</option>
            <option value="4">4 spaces</option>
            <option value="tab">Tabs</option>
          </select>
        </div>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={autoFormat}
            onChange={(event) => setAutoFormat(event.target.checked)}
          />
          Auto-format when you click away
        </label>
      </div>

      {fileError && <p className="field-error">{fileError}</p>}

      <div
        className={isDragging ? 'json-editor-wrapper dragging' : 'json-editor-wrapper'}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div className="json-editor-gutter" ref={gutterRef} aria-hidden="true">
          {lines.map((_, index) => {
            const lineNumber = index + 1;
            const isErrorLine = validation && !validation.ok && validation.line === lineNumber;
            return (
              <div key={lineNumber} className={isErrorLine ? 'json-gutter-line error' : 'json-gutter-line'}>
                {lineNumber}
              </div>
            );
          })}
        </div>
        {/* Editor overlay: a textarea can't color individual characters,
            so the colored text you actually see is this <pre> underneath -
            the real textarea sits on top with fully transparent text (only
            its caret and selection highlight are visible), capturing input
            normally while the syntax-highlighted copy shows through. Both
            share identical font/padding/line-height so they line up
            exactly, and scroll together (see onScroll below). */}
        <div className="json-editor-body">
          <pre
            className="json-editor-highlight"
            aria-hidden="true"
            ref={highlightRef}
            // Safe: highlightJson() HTML-escapes every piece of the
            // original text before wrapping it in <span> tags - see
            // jsonHighlight.js.
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
          <textarea
            ref={textareaRef}
            className="json-editor-textarea"
            value={rawInput}
            onChange={(event) => {
              setRawInput(event.target.value);
              // The report/error describe a fix that's now out of date.
              setFixReport(null);
              setFixError('');
            }}
            onBlur={handleBlur}
            onScroll={(event) => {
              if (gutterRef.current) gutterRef.current.scrollTop = event.target.scrollTop;
              if (highlightRef.current) {
                highlightRef.current.scrollTop = event.target.scrollTop;
                highlightRef.current.scrollLeft = event.target.scrollLeft;
              }
            }}
            spellCheck="false"
            autoComplete="off"
            placeholder="Paste or type JSON here, or drop a .json file…"
            aria-label="JSON editor"
          />
        </div>
      </div>

      {rawInput.trim() === '' ? (
        <p className="category-empty">Paste, type, or upload JSON to get started.</p>
      ) : validation.ok ? (
        <p className="json-status json-status-valid">✓ Valid JSON</p>
      ) : (
        <div className="json-status json-status-invalid">
          <p>✗ {validation.error}</p>
          <p className="field-hint">
            Line {validation.line}, column {validation.column} (character {validation.position})
          </p>
        </div>
      )}

      {fixError && <p className="field-error">{fixError}</p>}

      {fixReport && (
        <div className="json-fix-report">
          <p>✓ Fixed! Here's what looked wrong and was corrected:</p>
          <ul>
            {fixReport.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {validation?.ok && duplicateKeys.length > 0 && (
        <p className="field-warning">
          Warning: duplicate key{duplicateKeys.length > 1 ? 's' : ''} found - {duplicateKeys.join(', ')}.
          JavaScript silently kept only the last value for each; the others were dropped.
        </p>
      )}

      {validation?.ok && (
        <>
          <div className="comparison-panel">
            <h3>Statistics</h3>
            <dl className="comparison-meta">
              <div>
                <dt>Characters</dt>
                <dd>{stats.charCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Characters (no whitespace)</dt>
                <dd>{stats.charCountNoWhitespace.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Lines</dt>
                <dd>{stats.lineCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt>File size</dt>
                <dd>{formatBytes(stats.fileSize)}</dd>
              </div>
              <div>
                <dt>Objects</dt>
                <dd>{stats.objectCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Arrays</dt>
                <dd>{stats.arrayCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Keys</dt>
                <dd>{stats.keyCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Nesting depth</dt>
                <dd>
                  {stats.maxDepth}
                  {stats.depthLimitHit ? '+' : ''}
                </dd>
              </div>
            </dl>
          </div>

          <div className="field">
            <div className="field-header">
              <label>Output</label>
            </div>
            <div className="mode-toggle">
              <button type="button" className="copy-button" onClick={handleCopyFormatted}>
                {copiedFormatted ? 'Copied!' : 'Copy formatted'}
              </button>
              <button type="button" className="copy-button" onClick={handleCopyMinified}>
                {copiedMinified ? 'Copied!' : 'Copy minified'}
              </button>
              <a className="download-button" href={formattedBlobUrl} download="formatted.json">
                Download formatted.json
              </a>
              <a className="download-button" href={minifiedBlobUrl} download="minified.json">
                Download minified.json
              </a>
            </div>
          </div>

          <div className="field">
            <label>Tree view</label>
            <JsonTreeView data={validation.value} />
          </div>
        </>
      )}

      <article className="tool-article">
        <p>
          Whether you're debugging an API response, cleaning up a config file, or just trying to
          read a wall of minified JSON, this tool formats, validates, minifies, automatically
          repairs broken syntax, and inspects JSON with a colorful tree view - entirely in your
          browser, with your data never uploaded anywhere.
        </p>

        <h2>How JSON formatting works</h2>
        <p>
          "Formatting" (or pretty-printing) doesn't change the data at all - it only changes the
          whitespace, adding indentation and line breaks so nested structure is easy to read.
          Under the hood this tool uses <code>JSON.parse()</code> to read your JSON into a real
          JavaScript value, then <code>JSON.stringify()</code> to write it back out with your
          chosen indentation (or none, for minifying).
        </p>

        <h2>Why JSON validation matters</h2>
        <p>
          A single stray comma or missing quote makes an entire JSON document unreadable to any
          program expecting to parse it - and the resulting error messages are often unhelpful on
          their own. This tool points to the exact line, column, and character where parsing
          failed, so you can find and fix the problem directly instead of scanning by eye.
        </p>

        <h2>Automatically fixing broken JSON</h2>
        <p>
          When your JSON is invalid, the <strong>Fix JSON</strong> button attempts to repair it
          automatically - handling the most common problems in one click: missing or trailing
          commas, missing closing brackets/braces, unquoted object keys, single-quoted strings,
          and stray comments. Afterward it shows a short summary of what it believes it changed,
          so a fix is never a silent black box. If the JSON is too badly broken to recover, it
          says so plainly rather than guessing at something that isn't there.
        </p>

        <h2>Pretty print vs minify</h2>
        <p>
          Pretty-printed JSON is for humans - indentation and line breaks make structure easy to
          follow while editing or reviewing. Minified JSON strips all of that whitespace, producing
          the smallest possible file - better for what you actually send over a network or store,
          since the extra formatting characters serve no purpose there.
        </p>

        <h2>Common JSON mistakes</h2>
        <ul>
          <li>Trailing commas after the last item in an object or array - valid in JavaScript object literals, but not in JSON. (Auto-fixable.)</li>
          <li>Using single quotes instead of double quotes - JSON strings must use double quotes. (Auto-fixable.)</li>
          <li>Leaving a comment in the file - JSON has no comment syntax at all. (Auto-fixable.)</li>
          <li>Missing a closing bracket or brace, especially in deeply nested structures. (Auto-fixable.)</li>
          <li>Duplicate keys in the same object - technically parseable (the last one silently wins), but almost always a mistake worth fixing. This one isn't something "Fix JSON" changes, since it's valid syntax - the duplicate-key warning flags it instead.</li>
        </ul>

        <h2>Best practices</h2>
        <ul>
          <li>Keep nesting as shallow as practical - deeply nested JSON is hard for humans to read and easy to make mistakes in.</li>
          <li>Use consistent key naming (e.g. always camelCase or always snake_case) throughout a document.</li>
          <li>Minify JSON before sending it over a network; keep a pretty-printed copy for editing.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Why does my JSON say "Unexpected token" but I can't find the problem?</h3>
          <p>
            Check the line and column this tool reports - the error usually points at, or just
            after, a missing comma, quote, or bracket immediately before that position.
          </p>
        </div>
        <div className="faq-item">
          <h3>Are trailing commas ever allowed in JSON?</h3>
          <p>
            No - unlike JavaScript object/array literals, standard JSON never allows a trailing
            comma before a closing <code>{'}'}</code> or <code>]</code>.
          </p>
        </div>
        <div className="faq-item">
          <h3>What happens if my JSON has duplicate keys?</h3>
          <p>
            It still parses - JavaScript keeps only the last value for a repeated key and silently
            drops the earlier ones. This tool detects and warns about that rather than failing,
            since it's technically valid but usually unintentional.
          </p>
        </div>
        <div className="faq-item">
          <h3>What's the difference between formatting and validating?</h3>
          <p>
            Validating just checks whether the JSON is syntactically correct. Formatting also
            rewrites its whitespace for readability - you can't format invalid JSON, since there's
            no valid structure to lay out.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my JSON uploaded anywhere?</h3>
          <p>No - parsing, formatting, and minifying all happen locally using your browser's own JSON engine.</p>
        </div>
        <div className="faq-item">
          <h3>Can this tool fix broken JSON automatically?</h3>
          <p>
            Yes - the <strong>Fix JSON</strong> button (enabled whenever the JSON is invalid)
            handles common problems like missing commas, missing brackets, unquoted keys, and
            single quotes, then shows a short summary of what it changed. Severely malformed
            input may still be beyond automatic repair.
          </p>
        </div>

        <h2>Related tools</h2>
        <p>
          Browse the rest of the <Link to="/category/developer">Developer tools</Link> on Rootconverter.
        </p>
      </article>
    </div>
  );
}
