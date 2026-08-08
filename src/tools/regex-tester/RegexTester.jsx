import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import {
  parseRegex,
  validateRegex,
  executeRegex,
  highlightMatches,
  explainRegex,
  replaceMatches,
  countCaptureGroups,
  formatMatchesAsText,
  buildFlagsString,
  validateTestTextFile,
  readTestTextFile,
  FLAG_OPTIONS,
  DEFAULT_FLAGS,
  COMMON_PATTERNS,
  CHEAT_SHEET,
} from './regexUtils.js';

// The number of individual match cards rendered in the results list - a
// pattern like /./g against a large pasted document could otherwise
// produce thousands of DOM nodes. The Statistics panel's "Total matches"
// count always reflects the real total regardless of this cap.
const MAX_MATCH_CARDS = 500;

function flagsEqual(a, b) {
  return a.length === b.length && a.every((flag) => b.includes(flag));
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// All the actual regex work (parsing, matching, explaining, replacing)
// lives in regexUtils.js - this file is just the UI wired up to it,
// re-run directly in the render body on every change, like the other
// text tools on this site.

export default function RegexTester() {
  const fileInputRef = useRef(null);
  const highlightRef = useRef(null);
  const textareaRef = useRef(null);

  const [patternInput, setPatternInput] = useState('');
  const [flags, setFlags] = useState(DEFAULT_FLAGS);
  const [testText, setTestText] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const [replaceMode, setReplaceMode] = useState(false);
  const [replacement, setReplacement] = useState('');
  const [replacedBlobUrl, setReplacedBlobUrl] = useState('');

  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  // Holds a just-loaded file's text while we wait for the confirmation
  // above, if there's unsaved test text already.
  const [pendingContent, setPendingContent] = useState(null);

  const [copiedRegex, setCopiedRegex] = useState(false);
  const [copiedMatches, setCopiedMatches] = useState(false);
  const [copiedReplaced, setCopiedReplaced] = useState(false);

  // Re-parses and re-matches on every change - simple, and matches how
  // the other text tools on this site work (no debouncing).
  const parsed = parseRegex(patternInput);
  const flagsString = buildFlagsString(flags);
  const validation = validateRegex(parsed.source, flagsString);
  const matches = validation.ok ? executeRegex(validation.regex, testText) : [];
  const safeMatchIndex = matches.length === 0 ? 0 : Math.min(currentMatchIndex, matches.length - 1);
  const explanation = validation.ok ? explainRegex(parsed.source) : [];
  const captureGroupCount = validation.ok ? countCaptureGroups(parsed.source) : 0;

  // A trailing space keeps the overlay's last line from collapsing to
  // zero height when the text ends right after a newline (see the
  // "Editor overlay" comment below).
  const highlightedHtml = `${highlightMatches(testText, matches, safeMatchIndex)} `;

  // Uses a FRESH RegExp instance rather than `validation.regex` - that
  // object's lastIndex was already advanced by executeRegex() above, and
  // reusing it here could make the preview start from the wrong position
  // for a sticky-without-global pattern. String.replace() is otherwise
  // unaffected by that for global (it resets lastIndex itself) or plain
  // non-global/non-sticky patterns (which ignore lastIndex entirely), but
  // a fresh instance is correct for every flag combination.
  const replaceValidation = replaceMode ? validateRegex(parsed.source, flagsString) : null;
  const replaceResult =
    replaceMode && replaceValidation?.ok ? replaceMatches(replaceValidation.regex, testText, replacement) : null;

  // Keeps the currently-selected match scrolled into view inside the
  // editor overlay, and mirrors that scroll position onto the real
  // (invisible) textarea underneath it so the two stay aligned. Depends
  // ONLY on safeMatchIndex (not testText/highlightedHtml) - it should
  // fire when Prev/Next or a match card changes the SELECTION, not on
  // every keystroke while typing, which would otherwise fight the user's
  // own scroll position while editing.
  useEffect(() => {
    const container = highlightRef.current;
    if (!container) return;
    const current = container.querySelector('.regex-hl-match-current');
    if (!current) return;
    current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (textareaRef.current) {
      textareaRef.current.scrollTop = container.scrollTop;
      textareaRef.current.scrollLeft = container.scrollLeft;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeMatchIndex]);

  // Builds a downloadable .txt file for the replaced text whenever it changes.
  useEffect(() => {
    if (!replaceResult?.ok || !replaceResult.result) {
      setReplacedBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      return;
    }
    const url = URL.createObjectURL(new Blob([replaceResult.result], { type: 'text/plain' }));
    setReplacedBlobUrl(url);
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replaceResult?.ok, replaceResult?.result]);

  function handlePatternChange(event) {
    const value = event.target.value;
    setPatternInput(value);
    setCurrentMatchIndex(0);

    // A pasted/typed /pattern/flags literal pre-checks the matching flag
    // boxes as a convenience - the boxes stay the single source of truth
    // for what's actually applied, this just saves a few clicks.
    const { delimiterFlags } = parseRegex(value);
    if (delimiterFlags) {
      const recognized = [...delimiterFlags].filter((flag) => FLAG_OPTIONS.some((option) => option.key === flag));
      if (recognized.length > 0) {
        setFlags((prev) => [...new Set([...prev, ...recognized])]);
      }
    }
  }

  function toggleFlag(key) {
    setFlags((prev) => (prev.includes(key) ? prev.filter((flag) => flag !== key) : [...prev, key]));
    setCurrentMatchIndex(0);
  }

  function handleInsertPattern(common) {
    setPatternInput(common.pattern);
    setFlags(common.flags);
    setCurrentMatchIndex(0);
  }

  function goToMatch(delta) {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => {
      const safePrev = Math.min(prev, matches.length - 1);
      return (safePrev + delta + matches.length) % matches.length;
    });
  }

  function handleClearAll() {
    setPatternInput('');
    setFlags(DEFAULT_FLAGS);
    setTestText('');
    setReplacement('');
    setReplaceMode(false);
    setCurrentMatchIndex(0);
    setFileError('');
  }

  // Bringing in a file overwrites the whole test-text editor - if there's
  // unsaved work already, confirm first instead of silently discarding it.
  function loadNewContent(text) {
    if (hasUnsavedWork) {
      setPendingContent(text);
      setShowReplaceConfirm(true);
    } else {
      setTestText(text);
    }
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
    event.target.value = ''; // lets picking the same file again re-trigger this
  }

  async function handleCopyRegex() {
    if (!validation.ok) return;
    await navigator.clipboard.writeText(`/${parsed.source}/${flagsString}`);
    setCopiedRegex(true);
    setTimeout(() => setCopiedRegex(false), 1500);
  }

  async function handleCopyMatches() {
    const text = formatMatchesAsText(matches);
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedMatches(true);
    setTimeout(() => setCopiedMatches(false), 1500);
  }

  async function handleCopyReplaced() {
    if (!replaceResult?.ok || !replaceResult.result) return;
    await navigator.clipboard.writeText(replaceResult.result);
    setCopiedReplaced(true);
    setTimeout(() => setCopiedReplaced(false), 1500);
  }

  const hasText = testText.length > 0;
  const hasUnsavedWork =
    patternInput.trim().length > 0 ||
    hasText ||
    replacement.length > 0 ||
    replaceMode ||
    !flagsEqual(flags, DEFAULT_FLAGS);
  useUnsavedChangesWarning(hasUnsavedWork);

  return (
    <div className="regex-tester">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      {showReplaceConfirm && (
        <ConfirmDialog
          title="Replace current test text?"
          message="You have unsaved work in the editor. Loading this file will replace it."
          confirmLabel="Replace"
          onCancel={() => {
            setShowReplaceConfirm(false);
            setPendingContent(null);
          }}
          onConfirm={() => {
            setShowReplaceConfirm(false);
            setTestText(pendingContent ?? '');
            setPendingContent(null);
          }}
        />
      )}

      <div className="converter-toolbar json-toolbar">
        <button type="button" className="ghost-button" onClick={handleCopyRegex} disabled={!validation.ok}>
          {copiedRegex ? 'Copied!' : 'Copy Regex'}
        </button>
        <button type="button" className="ghost-button" onClick={handleCopyMatches} disabled={matches.length === 0}>
          {copiedMatches ? 'Copied!' : 'Copy Matches'}
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={handleCopyReplaced}
          disabled={!replaceMode || !replaceResult?.ok || !replaceResult.result}
        >
          {copiedReplaced ? 'Copied!' : 'Copy Replaced Text'}
        </button>
        <button type="button" className="ghost-button" onClick={() => fileInputRef.current?.click()}>
          Upload TXT
        </button>
        <button type="button" className="ghost-button" onClick={handleClearAll}>
          Clear All
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

      <div className="field">
        <label htmlFor="regex-pattern">Regular expression</label>
        <input
          id="regex-pattern"
          type="text"
          value={patternInput}
          onChange={handlePatternChange}
          placeholder="Enter a pattern, e.g. \d+ or /\d+/g"
          spellCheck="false"
          autoComplete="off"
          className="regex-pattern-input"
        />
      </div>

      <div className="field">
        <div className="field-header">
          <label>Flags</label>
        </div>
        <div className="mode-toggle" role="group" aria-label="Regex flags">
          {FLAG_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={flags.includes(option.key) ? 'mode-button active' : 'mode-button'}
              onClick={() => toggleFlag(option.key)}
              title={`${option.name} - ${option.hint}`}
              aria-pressed={flags.includes(option.key)}
            >
              {option.key} <span className="regex-flag-name">{option.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field-header">
          <label>Common patterns</label>
        </div>
        <div className="mode-toggle">
          {COMMON_PATTERNS.map((common) => (
            <button key={common.id} type="button" className="mode-button" onClick={() => handleInsertPattern(common)}>
              {common.label}
            </button>
          ))}
        </div>
      </div>

      {patternInput.trim() === '' ? (
        <p className="field-hint">Enter a regular expression above to get started.</p>
      ) : validation.ok ? (
        <p className="json-status json-status-valid">✓ Valid regular expression</p>
      ) : (
        <p className="json-status json-status-invalid">✗ {validation.error}</p>
      )}

      <div className="field">
        <label htmlFor="regex-test-text">Test text</label>
        <div
          className={isDragging ? 'json-editor-wrapper dragging' : 'json-editor-wrapper'}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          {/* Editor overlay: a textarea can't color individual characters,
              so the colored text you actually see is this <pre> underneath -
              the real textarea sits on top with fully transparent text (only
              its caret and selection highlight are visible), capturing input
              normally while the highlighted copy shows through. Both share
              identical font/padding/line-height so they line up exactly, and
              scroll together (see onScroll below). */}
          <div className="json-editor-body">
            <pre
              className="json-editor-highlight"
              aria-hidden="true"
              ref={highlightRef}
              // Safe: highlightMatches() HTML-escapes every piece of the
              // original text before wrapping matches in <mark> - see
              // regexUtils.js.
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
            <textarea
              id="regex-test-text"
              ref={textareaRef}
              className="json-editor-textarea"
              value={testText}
              onChange={(event) => {
                setTestText(event.target.value);
                setCurrentMatchIndex(0);
              }}
              onScroll={(event) => {
                if (highlightRef.current) {
                  highlightRef.current.scrollTop = event.target.scrollTop;
                  highlightRef.current.scrollLeft = event.target.scrollLeft;
                }
              }}
              spellCheck="false"
              autoComplete="off"
              placeholder="Type or paste text here, or drop a .txt file…"
              aria-label="Test text"
            />
          </div>
        </div>
      </div>

      {!hasText && <p className="field-hint">Add some test text above to see matches highlighted live.</p>}

      <div className="comparison-panel">
        <h3>Statistics</h3>
        <dl className="comparison-meta">
          <div>
            <dt>Total matches</dt>
            <dd>{matches.length.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Current match</dt>
            <dd>{matches.length > 0 ? `${safeMatchIndex + 1} / ${matches.length}` : '-'}</dd>
          </div>
          <div>
            <dt>Regex length</dt>
            <dd>{parsed.source.length.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Text length</dt>
            <dd>{testText.length.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Capture groups</dt>
            <dd>{captureGroupCount.toLocaleString()}</dd>
          </div>
        </dl>
      </div>

      {matches.length > 0 && (
        <div className="field">
          <div className="field-header">
            <label>Matches</label>
            <div className="regex-match-nav">
              <button type="button" className="ghost-button" onClick={() => goToMatch(-1)} disabled={matches.length < 2}>
                ← Previous
              </button>
              <span className="regex-match-nav-count">
                {safeMatchIndex + 1} / {matches.length}
              </span>
              <button type="button" className="ghost-button" onClick={() => goToMatch(1)} disabled={matches.length < 2}>
                Next →
              </button>
            </div>
          </div>

          <ul className="regex-match-list">
            {matches.slice(0, MAX_MATCH_CARDS).map((match, i) => (
              <li key={`${match.index}-${i}`} className={i === safeMatchIndex ? 'regex-match-item active' : 'regex-match-item'}>
                <button
                  type="button"
                  className="regex-match-item-head"
                  onClick={() => setCurrentMatchIndex(i)}
                  aria-pressed={i === safeMatchIndex}
                >
                  Match {i + 1}
                </button>
                <dl className="comparison-meta">
                  <div>
                    <dt>Index</dt>
                    <dd>{match.index}</dd>
                  </div>
                  <div>
                    <dt>Length</dt>
                    <dd>{match.length}</dd>
                  </div>
                  <div>
                    <dt>Group 0 (full match)</dt>
                    <dd>{JSON.stringify(match.value)}</dd>
                  </div>
                  {match.groups.map((group, gi) => (
                    <div key={gi}>
                      <dt>Group {gi + 1}</dt>
                      <dd>{group === undefined ? '(did not participate)' : JSON.stringify(group)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
          {matches.length > MAX_MATCH_CARDS && (
            <p className="field-hint">
              Showing the first {MAX_MATCH_CARDS.toLocaleString()} of {matches.length.toLocaleString()} matches
              individually - the counts above still reflect all of them.
            </p>
          )}
        </div>
      )}

      {validation.ok && explanation.length > 0 && (
        <div className="field">
          <label>What this pattern does</label>
          <dl className="regex-explanation-list">
            {explanation.map((part, i) => (
              <div key={i}>
                <dt>{part.token}</dt>
                <dd>{part.description}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="field">
        <label className="checkbox-field">
          <input type="checkbox" checked={replaceMode} onChange={(event) => setReplaceMode(event.target.checked)} />
          Enable replace mode
        </label>

        {replaceMode && (
          <>
            <p className="field-hint">
              Using: <code>/{parsed.source}/{flagsString}</code>. Reference capture groups in the replacement with{' '}
              <code>$1</code>, <code>$2</code>, etc.
            </p>
            <div className="field">
              <label htmlFor="regex-replacement">Replacement</label>
              <input
                id="regex-replacement"
                type="text"
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
                placeholder="e.g. $2-$1"
              />
            </div>

            {!validation.ok ? (
              <p className="field-hint">Fix the regular expression above to see a replace preview.</p>
            ) : (
              <div className="field">
                <div className="field-header">
                  <label>Preview</label>
                </div>
                <textarea value={replaceResult?.ok ? replaceResult.result : ''} readOnly aria-label="Replace preview" />
                {replaceResult && !replaceResult.ok && <p className="field-error">{replaceResult.error}</p>}
                <div className="mode-toggle">
                  <button
                    type="button"
                    className="copy-button"
                    onClick={handleCopyReplaced}
                    disabled={!replaceResult?.ok || !replaceResult.result}
                  >
                    {copiedReplaced ? 'Copied!' : 'Copy replaced text'}
                  </button>
                  <a
                    className="download-button"
                    href={replacedBlobUrl || undefined}
                    download={replacedBlobUrl ? 'replaced.txt' : undefined}
                    aria-disabled={!replacedBlobUrl}
                  >
                    Download TXT
                  </a>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <details className="faq-entry regex-cheatsheet">
        <summary>Regex cheat sheet</summary>
        <div className="faq-entry-body">
          <dl className="regex-explanation-list">
            {CHEAT_SHEET.map((entry) => (
              <div key={entry.token}>
                <dt>{entry.token}</dt>
                <dd>{entry.description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>

      <article className="tool-article">
        <p>
          Whether you're debugging a validation pattern, extracting data from log lines, or just
          trying to remember what <code>\b</code> does, this tool tests, highlights, and explains
          regular expressions live as you type - entirely in your browser, using the same RegExp
          engine your code actually runs on, with nothing ever uploaded.
        </p>

        <h2>What regular expressions are</h2>
        <p>
          A regular expression (regex) is a small pattern language for describing text to search
          for, validate, or replace - instead of matching one exact string, a pattern like{' '}
          <code>\d+</code> matches "one or more digits" wherever they appear. Every mainstream
          programming language, including JavaScript, ships a built-in regex engine; this tool
          runs your pattern through the browser's own, so the behavior you see here is exactly
          what you'd get in real code.
        </p>

        <h2>Regex flags, explained</h2>
        <p>
          Flags change how a pattern is applied, not what it matches character-by-character.{' '}
          <strong>Global (g)</strong> finds every match instead of stopping at the first;{' '}
          <strong>Ignore Case (i)</strong> makes letters match regardless of case;{' '}
          <strong>Multiline (m)</strong> makes <code>^</code> and <code>$</code> match at the start
          and end of each line, not just the whole string; <strong>Dot All (s)</strong> lets{' '}
          <code>.</code> also match line breaks; <strong>Unicode (u)</strong> makes the engine
          treat the pattern as full Unicode code points instead of raw 16-bit code units (this
          matters for emoji and other characters outside the Basic Multilingual Plane); and{' '}
          <strong>Sticky (y)</strong> anchors matching to exactly the last match's ending position,
          with no scanning forward to find the next one.
        </p>

        <h2>Capturing groups</h2>
        <p>
          Wrapping part of a pattern in parentheses, like <code>{'(\\d{4})-(\\d{2})'}</code>, creates a{' '}
          <strong>capturing group</strong> - it remembers the text that part matched, numbered left
          to right starting at 1 (group 0 is always the entire match). Captured text can be reused
          in a replacement string as <code>$1</code>, <code>$2</code>, and so on, or read
          programmatically from the match result. Prefixing with <code>?:</code>, like{' '}
          <code>(?:abc)</code>, groups a pattern without capturing it - useful when you need
          grouping (for a quantifier or alternation) but don't need the matched text back.
        </p>

        <h2>Common regex mistakes</h2>
        <ul>
          <li>Forgetting the <strong>g</strong> flag, then being confused why only one match shows up.</li>
          <li>Using <code>.</code> when you mean a literal period - <code>.</code> matches ANY character unless escaped as <code>\.</code></li>
          <li>Greedy quantifiers (<code>.*</code>) matching far more than intended - a lazy <code>.*?</code> often gives the expected, narrower match instead.</li>
          <li>Forgetting to escape regex-special characters in literal text, like <code>$5.00</code>, where <code>$</code> and <code>.</code> both need a backslash to be literal.</li>
          <li>Assuming <code>\d</code>, <code>\w</code>, and similar shorthand classes match Unicode letters/digits the same as ASCII ones - without the <strong>u</strong> flag, matching behaves in terms of UTF-16 code units.</li>
        </ul>

        <h2>Performance tips</h2>
        <ul>
          <li>Avoid nested quantifiers on overlapping character sets, like <code>(a+)+</code> - these can trigger "catastrophic backtracking," where matching time explodes exponentially on certain inputs. This is a property of the regex engine itself (JavaScript's included), not something this tool can prevent - if a pattern here seems to hang, that's very likely the cause.</li>
          <li>Anchor patterns with <code>^</code>/<code>$</code> when you mean to match the whole string - it lets the engine fail fast instead of trying every starting position.</li>
          <li>Prefer specific character classes (<code>[0-9]</code>) over broad ones followed by heavy backtracking-prone quantifiers when performance matters on large text.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Why does my pattern only find one match?</h3>
          <p>
            Turn on the <strong>g (Global)</strong> flag - without it, JavaScript's RegExp only
            ever reports the first match it finds, which is exactly what this tool reproduces.
          </p>
        </div>
        <div className="faq-item">
          <h3>Do I need to type the slashes around my pattern?</h3>
          <p>
            No - typing just <code>\d+</code> works fine. If you paste a full{' '}
            <code>/\d+/gi</code> literal (slashes and all), the slashes are stripped automatically
            and any trailing flags are applied to the flag checkboxes for you.
          </p>
        </div>
        <div className="faq-item">
          <h3>Why is lookbehind not matching in my browser?</h3>
          <p>
            Lookbehind (<code>(?&lt;=...)</code> and <code>(?&lt;!...)</code>) is supported in all
            current versions of Chrome, Edge, Firefox, and Safari, but only relatively recently in
            Safari's case - an older browser version is the most likely explanation if it seems
            unsupported.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my pattern or test text uploaded anywhere?</h3>
          <p>
            No - matching, highlighting, and replacing all run locally using your browser's own
            RegExp engine; nothing is sent anywhere.
          </p>
        </div>
        <div className="faq-item">
          <h3>Why did the page freeze on my pattern?</h3>
          <p>
            Almost certainly catastrophic backtracking (see Performance tips above) - a small
            number of patterns and inputs can make ANY regex engine take an extremely long time,
            which is an inherent property of backtracking-based matching, not a bug in this tool.
            Reloading the page will recover it.
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
