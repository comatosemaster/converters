import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { readTestTextFile } from '../regex-tester/regexUtils.js';
import { highlightSql } from './sqlHighlight.js';
import {
  DIALECTS,
  KEYWORD_CASE_OPTIONS,
  INDENT_OPTIONS,
  LINES_BETWEEN_OPTIONS,
  EXAMPLE_SQL,
  createDefaultOptions,
  formatSql,
  validateSqlFile,
} from './sqlUtils.js';

const DEFAULT_OPTIONS = createDefaultOptions();

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// All the actual formatting (via the sql-formatter package) and syntax
// highlighting live in sqlUtils.js/sqlHighlight.js - this file is just
// the UI wired up to them.
//
// Unlike most converters on this site, formatting here is NOT re-run on
// every keystroke - re-indenting a query out from under someone mid-edit
// (and flashing a parse error on every incomplete WHERE clause) would be
// actively annoying, not helpful. Instead: "Format SQL" runs it once
// explicitly (also triggered right after loading an example or a file,
// since that's a deliberate "give me content" action), and afterward,
// changing a FORMAT OPTION (dialect, case, indent, spacing) re-formats
// automatically using whatever's already in the input - editing the raw
// SQL text always requires clicking "Format SQL" again.

export default function SqlFormatter() {
  const fileInputRef = useRef(null);
  const highlightRef = useRef(null);

  const [sqlInput, setSqlInput] = useState('');
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [outputSql, setOutputSql] = useState('');
  const [formatError, setFormatError] = useState('');

  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [pendingContent, setPendingContent] = useState(null);

  const [copied, setCopied] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');

  const hasFormattedOnce = outputSql !== '' || formatError !== '';
  const hasUnsavedWork = sqlInput.trim() !== '' || JSON.stringify(options) !== JSON.stringify(DEFAULT_OPTIONS);
  useUnsavedChangesWarning(hasUnsavedWork);

  function runFormat(sourceText = sqlInput, sourceOptions = options) {
    const result = formatSql(sourceText, sourceOptions);
    setOutputSql(result.ok ? result.formatted : '');
    setFormatError(result.ok ? '' : result.error);
  }

  // Re-formats automatically when a FORMAT OPTION changes, but only once
  // the user has already formatted at least once - see the file header
  // comment for why raw text edits don't trigger this same effect.
  useEffect(() => {
    if (sqlInput.trim() && hasFormattedOnce) runFormat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  // Builds a downloadable .sql file whenever the formatted output
  // changes - same pattern as every other export-capable tool here.
  useEffect(() => {
    if (!outputSql) {
      setDownloadUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      return;
    }
    const url = URL.createObjectURL(new Blob([outputSql], { type: 'application/sql' }));
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [outputSql]);

  function updateOption(id, value) {
    setOptions((prev) => ({ ...prev, [id]: value }));
  }

  // Bringing in an example or a file overwrites the whole input - if
  // there's unsaved work already, confirm first instead of silently
  // discarding it (same shape as RegexTester.jsx/JwtDecoder.jsx).
  function loadNewContent(text) {
    if (sqlInput.trim()) {
      setPendingContent(text);
      setShowReplaceConfirm(true);
    } else {
      setSqlInput(text);
      runFormat(text, options);
    }
  }

  function handleLoadExample() {
    loadNewContent(EXAMPLE_SQL);
  }

  async function loadFile(file) {
    const fileValidation = validateSqlFile(file);
    if (!fileValidation.ok) {
      setFileError(fileValidation.error);
      return;
    }
    try {
      const text = await readTestTextFile(file);
      setFileError('');
      loadNewContent(text);
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

  function handleClear() {
    setSqlInput('');
    setOutputSql('');
    setFormatError('');
    setOptions(DEFAULT_OPTIONS);
    setFileError('');
  }

  async function handleCopy() {
    if (!outputSql) return;
    await navigator.clipboard.writeText(outputSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const highlightedInputHtml = `${highlightSql(sqlInput)} `;

  return (
    <div className="sql-formatter">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      {showReplaceConfirm && (
        <ConfirmDialog
          title="Replace current SQL?"
          message="You have SQL in the input already. Loading this will replace it."
          confirmLabel="Replace"
          onCancel={() => {
            setShowReplaceConfirm(false);
            setPendingContent(null);
          }}
          onConfirm={() => {
            setShowReplaceConfirm(false);
            setSqlInput(pendingContent ?? '');
            runFormat(pendingContent ?? '', options);
            setPendingContent(null);
          }}
        />
      )}

      <div className="converter-toolbar json-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => runFormat()} disabled={!sqlInput.trim()}>
          Format SQL
        </button>
        <button type="button" className="ghost-button" onClick={handleCopy} disabled={!outputSql}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <a className="ghost-button" href={downloadUrl || undefined} download={downloadUrl ? 'formatted.sql' : undefined}>
          Download .sql
        </a>
        <button type="button" className="ghost-button" onClick={() => fileInputRef.current?.click()}>
          Upload SQL
        </button>
        <button type="button" className="ghost-button" onClick={handleLoadExample}>
          Load Example
        </button>
        <button type="button" className="ghost-button" onClick={handleClear}>
          Clear
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".sql,text/plain"
          className="visually-hidden"
          onChange={handleFileInputChange}
        />
      </div>

      {fileError && <p className="field-error">{fileError}</p>}

      <div className="unit-converter-row">
        <div className="field">
          <label htmlFor="sql-dialect">Dialect</label>
          <select id="sql-dialect" value={options.dialect} onChange={(event) => updateOption('dialect', event.target.value)}>
            {DIALECTS.map((dialect) => (
              <option key={dialect.id} value={dialect.id}>
                {dialect.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sql-keyword-case">Keyword case</label>
          <select
            id="sql-keyword-case"
            value={options.keywordCase}
            onChange={(event) => updateOption('keywordCase', event.target.value)}
          >
            {KEYWORD_CASE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sql-indent">Indentation</label>
          <select
            id="sql-indent"
            value={options.indentSize}
            onChange={(event) => updateOption('indentSize', Number(event.target.value))}
          >
            {INDENT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sql-lines-between">Lines between statements</label>
          <select
            id="sql-lines-between"
            value={options.linesBetweenQueries}
            onChange={(event) => updateOption('linesBetweenQueries', Number(event.target.value))}
          >
            {LINES_BETWEEN_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="qr-layout sql-layout">
        <div className="field">
          <label htmlFor="sql-input">SQL input</label>
          <div
            className={isDragging ? 'json-editor-wrapper dragging sql-editor-wrapper' : 'json-editor-wrapper sql-editor-wrapper'}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="json-editor-body">
              {/* Editor overlay: a textarea can't color individual
                  characters, so the colored text you actually see is this
                  <pre> underneath - the real textarea sits on top with
                  fully transparent text (only its caret/selection show),
                  capturing input normally while the highlighted copy
                  shows through. See RegexTester.jsx for the original of
                  this exact pattern. */}
              <pre
                className="json-editor-highlight"
                aria-hidden="true"
                ref={highlightRef}
                // Safe: highlightSql() HTML-escapes every piece of the
                // original text before wrapping tokens in <span> - see
                // sqlHighlight.js.
                dangerouslySetInnerHTML={{ __html: highlightedInputHtml }}
              />
              <textarea
                id="sql-input"
                className="json-editor-textarea"
                value={sqlInput}
                onChange={(event) => setSqlInput(event.target.value)}
                onScroll={(event) => {
                  if (highlightRef.current) {
                    highlightRef.current.scrollTop = event.target.scrollTop;
                    highlightRef.current.scrollLeft = event.target.scrollLeft;
                  }
                }}
                spellCheck="false"
                autoComplete="off"
                placeholder="Type or paste SQL here, or drop a .sql file…"
                aria-label="SQL input"
              />
            </div>
          </div>
          <p className="field-hint">{sqlInput.length.toLocaleString()} characters</p>
        </div>

        <div className="field">
          <div className="field-header">
            <label htmlFor="sql-output">Formatted SQL</label>
          </div>
          {formatError ? (
            <p className="json-status json-status-invalid">✗ {formatError}</p>
          ) : !outputSql ? (
            <p className="field-hint">Click "Format SQL" above to see the formatted result here.</p>
          ) : (
            <>
              <pre id="sql-output" className="gradient-css-block sql-output-block" tabIndex={0} aria-label="Formatted SQL output">
                <code dangerouslySetInnerHTML={{ __html: highlightSql(outputSql) }} />
              </pre>
              <p className="field-hint">{outputSql.length.toLocaleString()} characters</p>
            </>
          )}
        </div>
      </div>

      <article className="tool-article">
        <p>
          Whether you're cleaning up a query pasted from a slow Slack message, standardizing style
          across a team, or just trying to actually read a 40-line unformatted <code>SELECT</code>,
          this tool formats SQL instantly in your browser across five common dialects - nothing you
          paste is ever uploaded.
        </p>

        <h2>What is SQL formatting?</h2>
        <p>
          SQL formatting rewrites a query's whitespace, indentation, and keyword casing into a
          consistent, readable style without changing what the query actually does - clauses like{' '}
          <code>SELECT</code>, <code>FROM</code>, and <code>WHERE</code> each start their own line,
          nested expressions indent to show their structure, and keywords follow one consistent
          case throughout.
        </p>

        <h2>Supported SQL dialects</h2>
        <p>
          Most SQL is shared across databases, but clause syntax (like SQL Server's{' '}
          <code>TOP</code> versus everyone else's <code>LIMIT</code>) varies enough that a
          dialect-aware formatter avoids misreading valid syntax as broken. This tool supports
          Generic SQL (the common subset), MySQL, PostgreSQL, SQLite, and SQL Server (T-SQL) -
          pick whichever matches where the query is actually going to run.
        </p>

        <h2>Why formatting improves readability</h2>
        <p>
          A consistently formatted query is faster to scan, easier to diff in version control (one
          real change doesn't get buried in unrelated whitespace noise), and easier to spot bugs
          in - a missing <code>JOIN</code> condition or an unintended cartesian product is much
          more visible when every clause has its own clearly indented line.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Does formatting change what my query does?</h3>
          <p>
            No - only whitespace, line breaks, and keyword casing change. The actual SQL logic
            (table names, conditions, joins, values) is never rewritten.
          </p>
        </div>
        <div className="faq-item">
          <h3>Why doesn't the output update while I'm typing?</h3>
          <p>
            Re-indenting your query out from under you mid-edit - and flashing a parse error on
            every incomplete clause - would be more annoying than helpful. Click "Format SQL" when
            you're ready; changing a style option afterward (dialect, case, indentation) does
            re-format automatically using whatever's currently in the input.
          </p>
        </div>
        <div className="faq-item">
          <h3>What happens if my SQL has a syntax error?</h3>
          <p>
            You'll see a friendly message pointing at roughly where the parser got stuck, instead
            of a raw error or a crashed page - common causes are unbalanced parentheses, an
            unclosed quote, or a missing keyword.
          </p>
        </div>
        <div className="faq-item">
          <h3>Can I format multiple statements at once?</h3>
          <p>
            Yes - separate statements with semicolons, and use "Lines between statements" to
            control how much blank space separates them in the output.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my SQL uploaded anywhere?</h3>
          <p>
            No - formatting and highlighting both run locally in your browser; your query is never
            sent anywhere.
          </p>
        </div>

        <h2>Related tools</h2>
        <p>
          Try the <Link to="/tool/json-formatter-validator">JSON Formatter, Validator &amp; Fixer</Link> or the{' '}
          <Link to="/tool/regex-tester">Regex Tester</Link>, or browse the rest of the{' '}
          <Link to="/category/developer">Developer tools</Link> on Rootconverter.
        </p>
      </article>
    </div>
  );
}
