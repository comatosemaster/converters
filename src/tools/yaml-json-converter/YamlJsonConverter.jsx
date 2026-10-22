import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';
import { validateJson } from '../json-formatter-validator/jsonUtils.js';
import { highlightJson } from '../json-formatter-validator/jsonHighlight.js';
import { EXAMPLE_JSON, EXAMPLE_YAML, jsonToYaml, yamlToJson } from './yamlJsonUtils.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
// Coloring a multi-megabyte result would make the page sluggish; past
// this size only the start is shown. Copy and Download use everything.
const MAX_DISPLAY_CHARS = 200_000;

const DIRECTIONS = [
  { id: 'yaml-to-json', label: 'YAML → JSON' },
  { id: 'json-to-yaml', label: 'JSON → YAML' },
];

const DEFAULT_OPTIONS = { jsonIndent: '2', multiDoc: 'array', yamlIndent: '2', sortKeys: false, wrap: false };

function downloadText(text, fileName, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// The conversion lives in yamlJsonUtils.js (js-yaml); JSON parsing and
// coloring reuse the JSON Formatter's own helpers, so error positions and
// colors match that tool exactly.

export default function YamlJsonConverter() {
  const fileInputRef = useRef(null);

  const [direction, setDirection] = useState('yaml-to-json');
  const [input, setInput] = useState('');
  const [fileBaseName, setFileBaseName] = useState('data');
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const [copied, setCopied] = useState(false);
  // The output last copied or downloaded - once it's been taken away,
  // there's nothing left to lose.
  const [savedOutput, setSavedOutput] = useState(null);
  const [pending, setPending] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const deferredInput = useDeferredValue(input);
  const isYamlToJson = direction === 'yaml-to-json';

  const result = useMemo(() => {
    if (!deferredInput.trim()) return null;
    if (isYamlToJson) {
      return yamlToJson(deferredInput, { indent: options.jsonIndent, multiDoc: options.multiDoc });
    }
    const parsed = validateJson(deferredInput);
    if (!parsed.ok) return { ok: false, error: `Invalid JSON: ${parsed.error}`, line: parsed.line, column: parsed.column };
    return jsonToYaml(parsed.value, { indent: options.yamlIndent, sortKeys: options.sortKeys, wrap: options.wrap });
  }, [deferredInput, isYamlToJson, options]);

  const output = result?.ok ? (isYamlToJson ? result.json : result.yaml) : '';
  const isSaved = output !== '' && output === savedOutput;
  const hasUnsavedWork = input.trim() !== '' && !isSaved;
  useUnsavedChangesWarning(hasUnsavedWork);

  const shownOutput = output.length > MAX_DISPLAY_CHARS ? output.slice(0, MAX_DISPLAY_CHARS) : output;
  const outputHtml = useMemo(
    () => (isYamlToJson && shownOutput ? highlightJson(shownOutput) : ''),
    [isYamlToJson, shownOutput],
  );

  function applyContent({ text, direction: nextDirection, name }) {
    setInput(text);
    setDirection(nextDirection);
    setFileBaseName(name);
    setSavedOutput(null);
  }

  function loadContent(text, nextDirection, name = 'data') {
    if (hasUnsavedWork) setPending({ text, direction: nextDirection, name });
    else applyContent({ text, direction: nextDirection, name });
  }

  async function loadFile(file) {
    if (file.size > MAX_FILE_SIZE) {
      setFileError(`That file is too large (over ${formatBytes(MAX_FILE_SIZE)}).`);
      return;
    }
    const isJson = /\.json$/i.test(file.name) || file.type === 'application/json';
    const isYaml = /\.(ya?ml|txt)$/i.test(file.name) || file.type.startsWith('text/');
    if (!isJson && !isYaml) {
      setFileError('Please choose a .yaml, .yml or .json file.');
      return;
    }
    try {
      const text = await file.text();
      setFileError('');
      loadContent(text.replace(/^﻿/, ''), isJson ? 'json-to-yaml' : 'yaml-to-json', file.name.replace(/\.[^.]+$/, '') || 'data');
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

  function handleSwap() {
    setInput(output);
    setDirection(isYamlToJson ? 'json-to-yaml' : 'yaml-to-json');
    setSavedOutput(null);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(output);
    setSavedOutput(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleDownload() {
    if (isYamlToJson) downloadText(output, `${fileBaseName}.json`, 'application/json');
    else downloadText(output, `${fileBaseName}.yaml`, 'application/yaml');
    setSavedOutput(output);
  }

  const update = (patch) => setOptions((prev) => ({ ...prev, ...patch }));
  const inputLines = input.split('\n');

  return (
    <div className="yaml-json-converter">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      {pending && (
        <ConfirmDialog
          title="Replace current input?"
          message="You have input that you haven't copied or downloaded the result of yet. Loading this will replace it."
          confirmLabel="Replace"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            applyContent(pending);
            setPending(null);
          }}
        />
      )}
      {showClearConfirm && (
        <ConfirmDialog
          title="Clear your input?"
          message="This removes the input and its converted result. It can't be undone."
          confirmLabel="Clear"
          onCancel={() => setShowClearConfirm(false)}
          onConfirm={() => {
            setShowClearConfirm(false);
            applyContent({ text: '', direction, name: 'data' });
            setFileError('');
          }}
        />
      )}

      <div className="mode-toggle" role="radiogroup" aria-label="Conversion direction">
        {DIRECTIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={direction === d.id}
            className={direction === d.id ? 'mode-button active' : 'mode-button'}
            onClick={() => setDirection(d.id)}
          >
            {d.label}
          </button>
        ))}
        <button type="button" className="swap-button" onClick={handleSwap} disabled={!output}>
          &#8646; Swap
        </button>
      </div>

      <div className="converter-toolbar json-toolbar">
        <button type="button" className="ghost-button" onClick={() => fileInputRef.current?.click()}>
          Upload file
        </button>
        {!input && (
          <button
            type="button"
            className="ghost-button"
            onClick={() => loadContent(isYamlToJson ? EXAMPLE_YAML : EXAMPLE_JSON, direction)}
          >
            Try an example
          </button>
        )}
        <button type="button" className="ghost-button" onClick={() => setShowClearConfirm(true)} disabled={!input}>
          Clear
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml,.json,.txt,application/json,application/yaml,text/yaml,text/plain"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files[0];
            if (file) loadFile(file);
            event.target.value = '';
          }}
        />
      </div>

      {isYamlToJson ? (
        <div className="json-options-row">
          <div className="field">
            <label htmlFor="yaml-json-indent">Indentation</label>
            <select id="yaml-json-indent" value={options.jsonIndent} onChange={(e) => update({ jsonIndent: e.target.value })}>
              <option value="2">2 spaces</option>
              <option value="4">4 spaces</option>
              <option value="tab">Tabs</option>
              <option value="0">Minified</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="yaml-multidoc">Several documents (---)</label>
            <select id="yaml-multidoc" value={options.multiDoc} onChange={(e) => update({ multiDoc: e.target.value })}>
              <option value="array">Combine into an array</option>
              <option value="first">Convert only the first</option>
            </select>
          </div>
        </div>
      ) : (
        <div className="json-options-row">
          <div className="field">
            <label htmlFor="yaml-indent">Indentation</label>
            <select id="yaml-indent" value={options.yamlIndent} onChange={(e) => update({ yamlIndent: e.target.value })}>
              <option value="2">2 spaces</option>
              <option value="4">4 spaces</option>
            </select>
          </div>
          <label className="checkbox-field">
            <input type="checkbox" checked={options.sortKeys} onChange={(e) => update({ sortKeys: e.target.checked })} />
            Sort keys A–Z
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={options.wrap} onChange={(e) => update({ wrap: e.target.checked })} />
            Wrap long text at 80 characters
          </label>
        </div>
      )}

      {fileError && <p className="field-error">{fileError}</p>}

      <div className="data-convert-panes">
        <div className="field">
          <label htmlFor="yaml-json-input">{isYamlToJson ? 'YAML input' : 'JSON input'}</label>
          <textarea
            id="yaml-json-input"
            className={isDragging ? 'data-convert-input dragging' : 'data-convert-input'}
            value={input}
            spellCheck={false}
            autoComplete="off"
            // YAML is indentation-sensitive, so Tab inserts two spaces here
            // instead of jumping to the next control. Esc then Tab still
            // leaves the box for keyboard users.
            onKeyDown={(event) => {
              if (event.key === 'Tab' && !event.shiftKey && isYamlToJson && !event.target.dataset.escaped) {
                event.preventDefault();
                document.execCommand('insertText', false, '  ');
              }
              if (event.key === 'Escape') event.target.dataset.escaped = '1';
              else if (event.key !== 'Tab') delete event.target.dataset.escaped;
            }}
            onBlur={(event) => delete event.target.dataset.escaped}
            placeholder={isYamlToJson ? 'Paste YAML here, or drop a .yaml file…' : 'Paste JSON here, or drop a .json file…'}
            onChange={(event) => setInput(event.target.value)}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          />
          <p className="field-hint">
            {inputLines.length.toLocaleString()} line{inputLines.length === 1 ? '' : 's'} · {input.length.toLocaleString()} characters
          </p>
        </div>

        <div className="field">
          <div className="field-header">
            <label htmlFor="yaml-json-output">{isYamlToJson ? 'JSON output' : 'YAML output'}</label>
            <div className="data-convert-actions">
              <button type="button" className="copy-button" onClick={handleCopy} disabled={!output}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleDownload} disabled={!output}>
                Download .{isYamlToJson ? 'json' : 'yaml'}
              </button>
            </div>
          </div>
          {isYamlToJson ? (
            <pre
              id="yaml-json-output"
              className="data-convert-output"
              tabIndex={0}
              // Safe: highlightJson() HTML-escapes every piece of the text
              // before wrapping it in <span>s - see jsonHighlight.js.
              dangerouslySetInnerHTML={{ __html: outputHtml }}
            />
          ) : (
            <pre id="yaml-json-output" className="data-convert-output" tabIndex={0}>
              {shownOutput}
            </pre>
          )}
          {output.length > MAX_DISPLAY_CHARS && (
            <p className="field-hint">
              Showing the first {MAX_DISPLAY_CHARS.toLocaleString()} characters - Copy and Download
              include all {output.length.toLocaleString()}.
            </p>
          )}
        </div>
      </div>

      {result && !result.ok && (
        <div className="json-status json-status-invalid" role="alert">
          <p>✗ {result.error}</p>
          {result.line && (
            <p className="field-hint">
              Line {result.line}, column {result.column}
              {isYamlToJson && inputLines[result.line - 1] !== undefined && (
                <>
                  : <code>{inputLines[result.line - 1].trim().slice(0, 80) || '(blank line)'}</code>
                </>
              )}
            </p>
          )}
        </div>
      )}
      {result?.ok && <p className="json-status json-status-valid">✓ Valid {isYamlToJson ? 'YAML' : 'JSON'}</p>}

      {result?.ok &&
        result.warnings.map((warning) => (
          <p key={warning} className="field-warning">{warning}</p>
        ))}

      <article className="tool-article">
        <p>
          This converter turns YAML into JSON and JSON into YAML as you type. It is built for the
          files developers actually juggle - Kubernetes manifests, docker-compose files, GitHub
          Actions workflows, OpenAPI specs and app configs - and shows the exact line of any
          syntax error. Everything runs in your browser, so configs with secrets in them never
          leave your device.
        </p>

        <h2>How to convert YAML to JSON</h2>
        <ol>
          <li>Paste YAML into the input box, or upload a .yaml or .yml file.</li>
          <li>The JSON appears straight away. If the YAML has a mistake, the line and column are shown so you can fix it.</li>
          <li>Copy the JSON, or download it as a .json file.</li>
        </ol>
        <p>
          Anchors and aliases (<code>&amp;defaults</code> and <code>*defaults</code>) and merge
          keys (<code>&lt;&lt;: *defaults</code>) are expanded, so the JSON contains the full,
          resolved values. A file with several documents separated by <code>---</code>, common in
          Kubernetes, becomes a JSON array with one item per document.
        </p>

        <h2>How to convert JSON to YAML</h2>
        <p>
          Switch to <strong>JSON → YAML</strong> and paste JSON. Keys keep their order unless you
          choose to sort them, multi-line strings become readable <code>|</code> blocks, and any
          value YAML could misread - such as the text <code>&quot;true&quot;</code>,{' '}
          <code>&quot;no&quot;</code> or <code>&quot;0123&quot;</code> - is quoted so it stays
          text.
        </p>

        <h2>YAML 1.2 and the &quot;Norway problem&quot;</h2>
        <p>
          Older YAML 1.1 parsers read <code>yes</code>, <code>no</code>, <code>on</code> and{' '}
          <code>off</code> as true or false - so the country code <code>NO</code> for Norway turned
          into <code>false</code>. This tool follows YAML 1.2, the current standard used by
          Kubernetes and most modern tools, where only <code>true</code> and <code>false</code> are
          booleans. Dates such as <code>2024-01-15</code> also stay exactly as written rather than
          being converted to timestamps.
        </p>

        <h2>What doesn&apos;t carry over</h2>
        <ul>
          <li><strong>Comments</strong> - JSON has no comment syntax, so YAML comments are dropped (the tool tells you when that happens).</li>
          <li><strong>Very large whole numbers</strong> - anything beyond about 16 digits can&apos;t be stored exactly in JSON. Quote such IDs to keep them as text.</li>
          <li><strong>.inf and .nan</strong> - these YAML numbers have no JSON equivalent and become <code>null</code>.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Is my YAML or JSON uploaded anywhere?</h3>
          <p>No - conversion happens in your browser and nothing is sent or stored, which makes it safe for configs containing passwords or API keys.</p>
        </div>
        <div className="faq-item">
          <h3>Why does my YAML give a &quot;bad indentation&quot; error?</h3>
          <p>YAML uses indentation to show structure, and tabs aren&apos;t allowed for it. Check that items at the same level line up exactly and use spaces only. Pressing Tab in the input box here inserts two spaces for you.</p>
        </div>
        <div className="faq-item">
          <h3>Is JSON valid YAML?</h3>
          <p>Almost always - YAML 1.2 was designed as a superset of JSON, so most JSON files can be read by a YAML parser as they are. Converting still helps when you want the cleaner, indented YAML style.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Format and repair JSON with the{' '}
          <Link to="/tool/json-formatter-validator">JSON Formatter, Validator &amp; Fixer</Link>,
          convert spreadsheets with the <Link to="/tool/csv-json-converter">CSV to JSON
          Converter</Link>, or browse all <Link to="/category/developer">Developer tools</Link>.
        </p>
      </article>
    </div>
  );
}
