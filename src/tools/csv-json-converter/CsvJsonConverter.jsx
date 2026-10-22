import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';
import { validateJson } from '../json-formatter-validator/jsonUtils.js';
import { highlightJson } from '../json-formatter-validator/jsonHighlight.js';
import {
  DELIMITERS,
  EXAMPLE_CSV,
  EXAMPLE_JSON,
  csvToJson,
  delimiterName,
  jsonToCsv,
} from './csvJsonUtils.js';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
// Showing (and coloring) a multi-megabyte result in the page would make
// it sluggish; past this size only the start is shown. Copy and Download
// always use the full result.
const MAX_DISPLAY_CHARS = 200_000;
const PREVIEW_ROWS = 50;

const DIRECTIONS = [
  { id: 'csv-to-json', label: 'CSV → JSON' },
  { id: 'json-to-csv', label: 'JSON → CSV' },
];

const DEFAULT_CSV_OPTIONS = { delimiter: 'auto', header: true, typed: true, unflatten: false, output: 'objects', indent: '2' };
const DEFAULT_JSON_OPTIONS = {
  delimiter: 'comma',
  header: true,
  flatten: true,
  quoteAll: false,
  escapeFormulas: false,
  lineEnding: '\r\n',
};

function downloadText(text, fileName, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoked a moment later rather than immediately, so the browser has
  // definitely started the download first.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// The conversion itself lives in csvJsonUtils.js - this file is the UI
// wired up to it, re-run as you type (deferred, so a big paste stays
// smooth).

export default function CsvJsonConverter() {
  const fileInputRef = useRef(null);

  const [direction, setDirection] = useState('csv-to-json');
  const [input, setInput] = useState('');
  const [fileBaseName, setFileBaseName] = useState('data');
  const [csvOptions, setCsvOptions] = useState(DEFAULT_CSV_OPTIONS);
  const [jsonOptions, setJsonOptions] = useState(DEFAULT_JSON_OPTIONS);
  const [excelBom, setExcelBom] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const [copied, setCopied] = useState(false);
  // The output text the user last copied or downloaded - once the current
  // output has been taken away, there's nothing left to lose.
  const [savedOutput, setSavedOutput] = useState(null);
  const [pending, setPending] = useState(null); // { text, direction, name } awaiting "Replace?"
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const deferredInput = useDeferredValue(input);
  const isCsvToJson = direction === 'csv-to-json';

  const result = useMemo(() => {
    if (!deferredInput.trim()) return null;
    if (isCsvToJson) {
      const delimiter = DELIMITERS.find((d) => d.id === csvOptions.delimiter)?.value ?? '';
      return csvToJson(deferredInput, { ...csvOptions, delimiter });
    }
    const parsed = validateJson(deferredInput);
    if (!parsed.ok) {
      return { ok: false, error: `Invalid JSON: ${parsed.error}`, line: parsed.line, column: parsed.column };
    }
    const delimiter = DELIMITERS.find((d) => d.id === jsonOptions.delimiter)?.value ?? ',';
    return jsonToCsv(parsed.value, { ...jsonOptions, delimiter });
  }, [deferredInput, isCsvToJson, csvOptions, jsonOptions]);

  const output = result?.ok ? (isCsvToJson ? result.json : result.csv) : '';
  const isSaved = output !== '' && output === savedOutput;
  const hasUnsavedWork = input.trim() !== '' && !isSaved;
  useUnsavedChangesWarning(hasUnsavedWork);

  const shownOutput = output.length > MAX_DISPLAY_CHARS ? output.slice(0, MAX_DISPLAY_CHARS) : output;
  const outputHtml = useMemo(
    () => (isCsvToJson && shownOutput ? highlightJson(shownOutput) : ''),
    [isCsvToJson, shownOutput],
  );

  function loadContent(text, nextDirection, name = 'data') {
    if (hasUnsavedWork) {
      setPending({ text, direction: nextDirection, name });
    } else {
      applyContent({ text, direction: nextDirection, name });
    }
  }

  function applyContent({ text, direction: nextDirection, name }) {
    setInput(text);
    setDirection(nextDirection);
    setFileBaseName(name);
    setSavedOutput(null);
  }

  async function loadFile(file) {
    if (file.size > MAX_FILE_SIZE) {
      setFileError(`That file is too large (over ${formatBytes(MAX_FILE_SIZE)}).`);
      return;
    }
    const isJson = /\.json$/i.test(file.name) || file.type === 'application/json';
    const isCsv = /\.(csv|tsv|txt)$/i.test(file.name) || file.type.startsWith('text/');
    if (!isJson && !isCsv) {
      setFileError('Please choose a .csv, .tsv, .txt or .json file.');
      return;
    }
    try {
      const text = await file.text();
      setFileError('');
      // Picks the direction from the file itself, so dropping a .json file
      // while "CSV → JSON" is selected still does the obvious thing.
      loadContent(text.replace(/^﻿/, ''), isJson ? 'json-to-csv' : 'csv-to-json', file.name.replace(/\.[^.]+$/, '') || 'data');
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
    // Carries the result over as the new input and flips direction, so
    // you can round-trip and check nothing was lost.
    setInput(output);
    setDirection(isCsvToJson ? 'json-to-csv' : 'csv-to-json');
    setSavedOutput(null);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(output);
    setSavedOutput(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleDownload() {
    if (isCsvToJson) {
      downloadText(output, `${fileBaseName}.json`, 'application/json');
    } else {
      // Excel assumes a CSV is in the PC's legacy code page unless the file
      // starts with a UTF-8 byte order mark - without it, accented letters
      // and non-Latin scripts turn into gibberish when double-clicked open.
      downloadText(excelBom ? `﻿${output}` : output, `${fileBaseName}.csv`, 'text/csv');
    }
    setSavedOutput(output);
  }

  const updateCsv = (patch) => setCsvOptions((prev) => ({ ...prev, ...patch }));
  const updateJson = (patch) => setJsonOptions((prev) => ({ ...prev, ...patch }));
  const messages = result?.ok ? (isCsvToJson ? result.warnings : result.notes) : [];
  const preview = result?.ok ? result.preview : null;

  return (
    <div className="csv-json-converter">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      {pending && (
        <ConfirmDialog
          title="Replace current data?"
          message="You have data in the input that you haven't copied or downloaded yet. Loading this will replace it."
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
          title="Clear your data?"
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
            onClick={() => loadContent(isCsvToJson ? EXAMPLE_CSV : EXAMPLE_JSON, direction)}
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
          accept=".csv,.tsv,.txt,.json,text/csv,text/plain,application/json"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files[0];
            if (file) loadFile(file);
            event.target.value = '';
          }}
        />
      </div>

      {isCsvToJson ? (
        <div className="json-options-row">
          <div className="field">
            <label htmlFor="csv-delimiter">Delimiter</label>
            <select id="csv-delimiter" value={csvOptions.delimiter} onChange={(e) => updateCsv({ delimiter: e.target.value })}>
              {DELIMITERS.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="csv-output">JSON shape</label>
            <select
              id="csv-output"
              value={csvOptions.output}
              disabled={!csvOptions.header}
              onChange={(e) => updateCsv({ output: e.target.value })}
            >
              <option value="objects">Array of objects</option>
              <option value="arrays">Array of arrays</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="csv-indent">Indentation</label>
            <select id="csv-indent" value={csvOptions.indent} onChange={(e) => updateCsv({ indent: e.target.value })}>
              <option value="2">2 spaces</option>
              <option value="4">4 spaces</option>
              <option value="tab">Tabs</option>
              <option value="0">Minified</option>
            </select>
          </div>
          <label className="checkbox-field">
            <input type="checkbox" checked={csvOptions.header} onChange={(e) => updateCsv({ header: e.target.checked })} />
            First row is column names
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={csvOptions.typed} onChange={(e) => updateCsv({ typed: e.target.checked })} />
            Detect numbers &amp; true/false
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={csvOptions.unflatten}
              disabled={!csvOptions.header || csvOptions.output === 'arrays'}
              onChange={(e) => updateCsv({ unflatten: e.target.checked })}
            />
            Nest &quot;a.b&quot; columns
          </label>
        </div>
      ) : (
        <div className="json-options-row">
          <div className="field">
            <label htmlFor="json-delimiter">Delimiter</label>
            <select id="json-delimiter" value={jsonOptions.delimiter} onChange={(e) => updateJson({ delimiter: e.target.value })}>
              {DELIMITERS.filter((d) => d.id !== 'auto').map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="json-line-ending">Line endings</label>
            <select id="json-line-ending" value={jsonOptions.lineEnding} onChange={(e) => updateJson({ lineEnding: e.target.value })}>
              <option value={'\r\n'}>Windows / Excel (CRLF)</option>
              <option value={'\n'}>Unix / Mac (LF)</option>
            </select>
          </div>
          <label className="checkbox-field">
            <input type="checkbox" checked={jsonOptions.header} onChange={(e) => updateJson({ header: e.target.checked })} />
            Header row
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={jsonOptions.flatten} onChange={(e) => updateJson({ flatten: e.target.checked })} />
            Flatten nested objects
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={jsonOptions.quoteAll} onChange={(e) => updateJson({ quoteAll: e.target.checked })} />
            Quote every field
          </label>
          <label className="checkbox-field" title="Prefixes cells starting with = + - @ so spreadsheets show them as text instead of running them">
            <input
              type="checkbox"
              checked={jsonOptions.escapeFormulas}
              onChange={(e) => updateJson({ escapeFormulas: e.target.checked })}
            />
            Block spreadsheet formulas
          </label>
        </div>
      )}

      {fileError && <p className="field-error">{fileError}</p>}

      <div className="data-convert-panes">
        <div className="field">
          <label htmlFor="csv-json-input">{isCsvToJson ? 'CSV input' : 'JSON input'}</label>
          <textarea
            id="csv-json-input"
            className={isDragging ? 'data-convert-input dragging' : 'data-convert-input'}
            value={input}
            spellCheck={false}
            autoComplete="off"
            placeholder={
              isCsvToJson
                ? 'Paste CSV here, or drop a .csv file…'
                : 'Paste a JSON array here, or drop a .json file…'
            }
            onChange={(event) => setInput(event.target.value)}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          />
          <p className="field-hint">
            {input.length.toLocaleString()} characters
            {result?.ok && isCsvToJson && <> · {delimiterName(result.delimiter)}-separated</>}
          </p>
        </div>

        <div className="field">
          <div className="field-header">
            <label htmlFor="csv-json-output">{isCsvToJson ? 'JSON output' : 'CSV output'}</label>
            <div className="data-convert-actions">
              <button type="button" className="copy-button" onClick={handleCopy} disabled={!output}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleDownload} disabled={!output}>
                Download .{isCsvToJson ? 'json' : 'csv'}
              </button>
            </div>
          </div>
          {isCsvToJson ? (
            <pre
              id="csv-json-output"
              className="data-convert-output"
              tabIndex={0}
              // Safe: highlightJson() HTML-escapes every piece of the text
              // before wrapping it in <span>s - see jsonHighlight.js.
              dangerouslySetInnerHTML={{ __html: outputHtml }}
            />
          ) : (
            <pre id="csv-json-output" className="data-convert-output" tabIndex={0}>
              {shownOutput}
            </pre>
          )}
          {output.length > MAX_DISPLAY_CHARS && (
            <p className="field-hint">
              Showing the first {MAX_DISPLAY_CHARS.toLocaleString()} characters - Copy and Download
              include all {output.length.toLocaleString()}.
            </p>
          )}
          {!isCsvToJson && output && (
            <label className="checkbox-field data-convert-bom">
              <input type="checkbox" checked={excelBom} onChange={(e) => setExcelBom(e.target.checked)} />
              Make the download open correctly in Excel (UTF-8 BOM)
            </label>
          )}
        </div>
      </div>

      {result && !result.ok && (
        <p className="field-error" role="alert">
          {result.error}
          {result.line ? ` (line ${result.line}, column ${result.column})` : ''}
        </p>
      )}

      {messages.map((message) => (
        <p key={message} className="field-warning">{message}</p>
      ))}

      {preview && preview.rows.length > 0 && (
        <section className="data-convert-preview" aria-label="Table preview">
          <h2 className="pdf-section-heading">
            Table preview · {result.rows.toLocaleString()} row{result.rows === 1 ? '' : 's'} ×{' '}
            {result.columns.toLocaleString()} column{result.columns === 1 ? '' : 's'}
          </h2>
          <div className="data-convert-table-wrap">
            <table className="data-convert-table">
              {preview.header && (
                <thead>
                  <tr>
                    {preview.header.map((name, i) => (
                      <th key={i} scope="col">{name}</th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {preview.rows.slice(0, PREVIEW_ROWS).map((row, r) => (
                  <tr key={r}>
                    {(preview.header ?? row).map((_, c) => (
                      <td key={c}>{row[c] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > PREVIEW_ROWS && (
            <p className="field-hint">
              Showing the first {PREVIEW_ROWS} rows of {preview.rows.length.toLocaleString()}.
            </p>
          )}
        </section>
      )}

      <article className="tool-article">
        <p>
          This converter turns CSV spreadsheet data into JSON and JSON back into CSV. Paste your
          data or drop a file, and the result appears as you type, with a table preview so you
          can check every column landed in the right place. It runs entirely in your browser, so
          customer lists, exports and reports never leave your device.
        </p>

        <h2>How to convert CSV to JSON</h2>
        <ol>
          <li>Paste CSV into the input box, or upload a .csv, .tsv or .txt file.</li>
          <li>The delimiter (comma, semicolon, tab or pipe) is detected automatically - pick one yourself if the guess is wrong.</li>
          <li>Copy the JSON or download it as a .json file.</li>
        </ol>
        <p>
          With <strong>First row is column names</strong> on, each row becomes an object keyed by
          the header, which is what most code and APIs expect. Turn it off to get plain arrays of
          values instead. Quoted fields that contain commas, line breaks or doubled
          &quot;&quot;quotes&quot;&quot; are handled the way Excel and Google Sheets write them.
        </p>

        <h2>Numbers, true/false and leading zeros</h2>
        <p>
          CSV has no data types - every cell is text. <strong>Detect numbers &amp; true/false</strong>{' '}
          turns cells like <code>42</code>, <code>3.14</code> and <code>true</code> into real JSON
          numbers and booleans, but it is deliberately careful: a ZIP code such as{' '}
          <code>0105</code>, a phone number with a leading zero, or an ID too long to store exactly
          stays as text, so nothing is silently changed.
        </p>

        <h2>How to convert JSON to CSV</h2>
        <p>
          Switch to <strong>JSON → CSV</strong> and paste an array of objects. Every key that
          appears in any object becomes a column, even if only some rows have it. Nested objects
          are flattened into dotted columns such as <code>address.city</code>, and lists are kept
          as JSON text in a single cell so they can be read back exactly. If your JSON is an API
          response like <code>{'{ "data": [ ... ] }'}</code>, the list inside is found
          automatically.
        </p>

        <h2>Opening the CSV in Excel</h2>
        <p>
          Excel guesses a CSV file&apos;s text encoding, and often guesses wrong for accented
          letters and non-Latin alphabets. The download adds a small UTF-8 marker (a BOM) that
          tells Excel the right encoding, so names like &quot;García&quot; or Georgian text open
          correctly. In countries where Excel expects semicolons, choose the semicolon delimiter.
          <strong> Block spreadsheet formulas</strong> protects you when the data came from
          strangers: cells starting with <code>=</code>, <code>+</code>, <code>-</code> or{' '}
          <code>@</code> are shown as text instead of being run as formulas.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Is my data uploaded?</h3>
          <p>No - parsing and conversion happen in your browser. Nothing is sent to a server or stored.</p>
        </div>
        <div className="faq-item">
          <h3>How large a file can it handle?</h3>
          <p>Files up to 20 MB load directly. Tens of thousands of rows convert in a moment; very large results show a shortened preview, but Copy and Download always include everything.</p>
        </div>
        <div className="faq-item">
          <h3>Can I turn the JSON back into the same CSV?</h3>
          <p>Yes - press <strong>Swap</strong> to send the result back through in the other direction and compare.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Format or repair JSON with the{' '}
          <Link to="/tool/json-formatter-validator">JSON Formatter, Validator &amp; Fixer</Link>,
          convert configuration files with the <Link to="/tool/yaml-json-converter">YAML to JSON
          Converter</Link>, or browse all <Link to="/category/text-data">Text &amp; Data tools</Link>.
        </p>
      </article>
    </div>
  );
}
