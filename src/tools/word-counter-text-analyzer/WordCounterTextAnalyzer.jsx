import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.js';
import { useUndoRedo } from '../../hooks/useUndoRedo.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';
import {
  calculateStatistics,
  calculateReadingTime,
  calculateSpeakingTime,
  calculateWordStats,
  calculateCharacterBreakdown,
  calculateKeywordDensity,
  searchOccurrences,
  convertCase,
  cleanText,
  calculateReadability,
  validateTextFile,
  readTextFile,
} from './textAnalysis.js';

const WRITING_LIMITS = [
  { id: 'title', label: 'Google Title', limit: 60 },
  { id: 'meta', label: 'Meta Description', limit: 160 },
  { id: 'tweet', label: 'Twitter / X Post', limit: 280 },
  { id: 'sms', label: 'SMS', limit: 160 },
];

const CASE_BUTTONS = [
  { mode: 'upper', label: 'UPPERCASE' },
  { mode: 'lower', label: 'lowercase' },
  { mode: 'title', label: 'Title Case' },
  { mode: 'sentence', label: 'Sentence case' },
  { mode: 'toggle', label: 'tOGGLE cASE' },
];

const CLEAN_BUTTONS = [
  { operation: 'remove-extra-spaces', label: 'Remove extra spaces' },
  { operation: 'remove-blank-lines', label: 'Remove blank lines' },
  { operation: 'remove-duplicate-lines', label: 'Remove duplicate lines' },
  { operation: 'trim-whitespace', label: 'Trim start/end whitespace' },
  { operation: 'sort-asc', label: 'Sort lines A → Z' },
  { operation: 'sort-desc', label: 'Sort lines Z → A' },
  { operation: 'reverse-lines', label: 'Reverse line order' },
];

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> — the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// The analysis logic lives in textAnalysis.js — this file is just the UI
// wired up to it, re-run directly in the render body on every change
// (like the other text tools on this site, there's no debounce).

export default function WordCounterTextAnalyzer() {
  const fileInputRef = useRef(null);

  // Raw typing uses setRawText (relies on the textarea's own native
  // Ctrl+Z) — every button below that transforms the whole text uses
  // applyChange instead, so a single Undo click reverses that one action.
  const { value: rawText, set: applyChange, setWithoutHistory: setRawText, undo, redo, canUndo, canRedo } =
    useUndoRedo('');
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  // Holds a just-loaded file's or clipboard's text while we wait for the
  // replace confirmation above.
  const [pendingContent, setPendingContent] = useState(null);
  const [copied, setCopied] = useState(false);
  const [textBlobUrl, setTextBlobUrl] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);

  const [ignoreStopWords, setIgnoreStopWords] = useState(true);
  const [targetWordCount, setTargetWordCount] = useState('');

  useDocumentMeta({
    title: 'Word Counter & Text Analyzer — Free & Client-Side | Toolbox',
    description:
      'Live word count, character count, reading time, keyword density, readability scores, and text cleanup tools — entirely in your browser.',
  });

  // Builds a downloadable .txt file whenever the text changes.
  useEffect(() => {
    if (!rawText) {
      setTextBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      return;
    }
    const url = URL.createObjectURL(new Blob([rawText], { type: 'text/plain' }));
    setTextBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [rawText]);

  function handleClear() {
    applyChange('');
    setFileError('');
    setSearchQuery('');
    setTargetWordCount('');
  }

  // Bringing in content from OUTSIDE (a file or the clipboard) needs the
  // discard confirmation below, since that can silently clobber unsaved
  // work — but either way, it goes through applyChange so it's undoable
  // too, the same as Clear and the case/cleanup buttons below.
  function loadNewContent(text) {
    if (hasUnsavedWork) {
      setPendingContent(text);
      setShowReplaceConfirm(true);
    } else {
      applyChange(text);
    }
  }

  async function handlePasteButton() {
    try {
      const text = await navigator.clipboard.readText();
      loadNewContent(text);
      setFileError('');
    } catch {
      setFileError("Couldn't read the clipboard — your browser may need permission, or paste directly into the editor instead.");
    }
  }

  async function loadFile(file) {
    const fileValidation = validateTextFile(file);
    if (!fileValidation.ok) {
      setFileError(fileValidation.error);
      return;
    }
    try {
      const text = await readTextFile(file);
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

  async function handleCopy() {
    if (!rawText) return;
    await navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const stats = calculateStatistics(rawText);
  const wordStats = calculateWordStats(stats.wordList);
  const charBreakdown = calculateCharacterBreakdown(rawText);
  const readability = calculateReadability(stats.wordList, stats.sentences);
  const keywords = calculateKeywordDensity(stats.wordList, { ignoreStopWords });
  const searchCount = searchOccurrences(rawText, searchQuery, { matchCase, wholeWord });

  const avgWordsPerSentence = stats.sentences ? stats.words / stats.sentences : 0;
  const avgCharsPerSentence = stats.sentences ? stats.charsWithSpaces / stats.sentences : 0;
  const avgWordsPerParagraph = stats.paragraphs ? stats.words / stats.paragraphs : 0;

  const targetWords = Number(targetWordCount) || 0;
  const goalProgress = targetWords > 0 ? Math.min(100, (stats.words / targetWords) * 100) : 0;
  const goalRemaining = Math.max(0, targetWords - stats.words);

  const hasText = rawText.trim().length > 0;
  // "Unsaved work" also covers a writing goal set on otherwise-empty text —
  // per this tool's spec, losing that setting counts too.
  const hasUnsavedWork = hasText || targetWordCount.trim().length > 0;
  useUnsavedChangesWarning(hasUnsavedWork);

  return (
    <div className="word-counter">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      {showReplaceConfirm && (
        <ConfirmDialog
          title="Replace current text?"
          message="You have unsaved text in the editor. Loading this will replace it."
          confirmLabel="Replace"
          onCancel={() => {
            setShowReplaceConfirm(false);
            setPendingContent(null);
          }}
          onConfirm={() => {
            setShowReplaceConfirm(false);
            applyChange(pendingContent ?? '');
            setPendingContent(null);
          }}
        />
      )}

      <div className="converter-toolbar json-toolbar">
        <button
          type="button"
          className="ghost-button"
          onClick={undo}
          disabled={!canUndo}
          title="Undo the last case/cleanup change (Ctrl+Z)"
        >
          ↶ Undo
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
        >
          ↷ Redo
        </button>
        <button type="button" className="ghost-button" onClick={handlePasteButton}>
          Paste
        </button>
        <button type="button" className="ghost-button" onClick={() => fileInputRef.current?.click()}>
          Upload TXT
        </button>
        <button type="button" className="ghost-button" onClick={handleCopy} disabled={!hasText}>
          {copied ? 'Copied!' : 'Copy text'}
        </button>
        <a
          className="ghost-button"
          href={hasText ? textBlobUrl : undefined}
          download={hasText ? 'text.txt' : undefined}
          aria-disabled={!hasText}
        >
          Download TXT
        </a>
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

      <div
        className={isDragging ? 'word-counter-editor-wrapper dragging' : 'word-counter-editor-wrapper'}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <textarea
          className="word-counter-editor"
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          onKeyDown={(event) => {
            // Only step in when there's actually a button-action to undo/
            // redo — otherwise let the key press fall through untouched,
            // so the browser's own native undo still handles plain typing.
            const withModifier = event.ctrlKey || event.metaKey;
            const isUndo = withModifier && !event.shiftKey && event.key.toLowerCase() === 'z';
            const isRedo =
              (withModifier && event.shiftKey && event.key.toLowerCase() === 'z') ||
              (withModifier && event.key.toLowerCase() === 'y');
            if (isUndo && canUndo) {
              event.preventDefault();
              undo();
            } else if (isRedo && canRedo) {
              event.preventDefault();
              redo();
            }
          }}
          placeholder="Type, paste, or drop a .txt file here…"
          spellCheck="true"
          aria-label="Text to analyze"
        />
      </div>

      {!hasText && (
        <p className="field-hint">
          Type, paste, or upload text to get started — every stat further down updates live as
          you go.
        </p>
      )}

      {/* Utilities first, right next to the editor — these are things you
          actively click while writing, so they shouldn't be buried below
          six panels of read-only statistics. */}
      <div className="field">
        <label>Case converter</label>
        <div className="mode-toggle">
          {CASE_BUTTONS.map((button) => (
            <button
              key={button.mode}
              type="button"
              className="mode-button"
              disabled={!hasText}
              onClick={() => applyChange(convertCase(rawText, button.mode))}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Text utilities</label>
        <div className="mode-toggle">
          {CLEAN_BUTTONS.map((button) => (
            <button
              key={button.operation}
              type="button"
              className="mode-button"
              disabled={!hasText}
              onClick={() => applyChange(cleanText(rawText, button.operation))}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="wc-search">Search in text</label>
        <input
          id="wc-search"
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Word or phrase…"
        />
        <div className="qr-color-row">
          <label className="checkbox-field">
            <input type="checkbox" checked={matchCase} onChange={(event) => setMatchCase(event.target.checked)} />
            Match case
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={wholeWord} onChange={(event) => setWholeWord(event.target.checked)} />
            Whole word only
          </label>
        </div>
        {searchQuery && (
          <p className="field-hint">
            {searchCount} occurrence{searchCount === 1 ? '' : 's'} of "{searchQuery}"
          </p>
        )}
      </div>

      {/* Statistics below the utilities — useful reference, but not
          something you click, so it doesn't need top billing. */}
      <div className="comparison">
        <div className="comparison-panel">
          <h3>Live statistics</h3>
          <dl className="comparison-meta">
            <div><dt>Words</dt><dd>{stats.words.toLocaleString()}</dd></div>
            <div><dt>Characters (with spaces)</dt><dd>{stats.charsWithSpaces.toLocaleString()}</dd></div>
            <div><dt>Characters (no spaces)</dt><dd>{stats.charsWithoutSpaces.toLocaleString()}</dd></div>
            <div><dt>Sentences</dt><dd>{stats.sentences.toLocaleString()}</dd></div>
            <div><dt>Paragraphs</dt><dd>{stats.paragraphs.toLocaleString()}</dd></div>
            <div><dt>Lines</dt><dd>{stats.lines.toLocaleString()}</dd></div>
          </dl>
        </div>

        <div className="comparison-panel">
          <h3>Reading statistics</h3>
          <dl className="comparison-meta">
            <div><dt>Reading time</dt><dd>{calculateReadingTime(stats.words)}</dd></div>
            <div><dt>Speaking time</dt><dd>{calculateSpeakingTime(stats.words)}</dd></div>
            <div><dt>Avg. words / sentence</dt><dd>{avgWordsPerSentence.toFixed(1)}</dd></div>
            <div><dt>Avg. characters / sentence</dt><dd>{avgCharsPerSentence.toFixed(1)}</dd></div>
            <div><dt>Avg. words / paragraph</dt><dd>{avgWordsPerParagraph.toFixed(1)}</dd></div>
          </dl>
        </div>

        <div className="comparison-panel">
          <h3>Text statistics</h3>
          <dl className="comparison-meta">
            <div><dt>Longest word</dt><dd>{wordStats.longestWord || '—'}</dd></div>
            <div><dt>Shortest word</dt><dd>{wordStats.shortestWord || '—'}</dd></div>
            <div><dt>Unique words</dt><dd>{wordStats.uniqueWords.toLocaleString()}</dd></div>
            <div><dt>Repeated words</dt><dd>{wordStats.repeatedWords.toLocaleString()}</dd></div>
            <div><dt>Vocabulary richness</dt><dd>{wordStats.vocabularyRichness.toFixed(1)}%</dd></div>
          </dl>
        </div>

        <div className="comparison-panel">
          <h3>Character breakdown</h3>
          <dl className="comparison-meta">
            <div><dt>Letters</dt><dd>{charBreakdown.letters.toLocaleString()}</dd></div>
            <div><dt>Numbers</dt><dd>{charBreakdown.numbers.toLocaleString()}</dd></div>
            <div><dt>Spaces</dt><dd>{charBreakdown.spaces.toLocaleString()}</dd></div>
            <div><dt>Punctuation</dt><dd>{charBreakdown.punctuation.toLocaleString()}</dd></div>
            <div><dt>Special / emoji</dt><dd>{charBreakdown.special.toLocaleString()}</dd></div>
          </dl>
        </div>

        <div className="comparison-panel">
          <h3>Readability</h3>
          {readability ? (
            <dl className="comparison-meta">
              <div>
                <dt>Flesch Reading Ease</dt>
                <dd>
                  {readability.fleschReadingEase.toFixed(1)} — {readability.fleschReadingEaseLabel}
                </dd>
              </div>
              <div>
                <dt>Flesch-Kincaid Grade Level</dt>
                <dd>{readability.fleschKincaidGrade.toFixed(1)}</dd>
              </div>
            </dl>
          ) : (
            <p className="field-hint">Add at least one full sentence to calculate this.</p>
          )}
          <p className="field-hint">
            Estimates based on English sentence/syllable heuristics — treat as a guide, not an
            exact score.
          </p>
        </div>

        <div className="comparison-panel">
          <h3>Common writing limits</h3>
          <dl className="comparison-meta">
            {WRITING_LIMITS.map((item) => (
              <div key={item.id}>
                <dt>{item.label}</dt>
                <dd className={stats.charsWithSpaces > item.limit ? 'limit-exceeded' : ''}>
                  {stats.charsWithSpaces.toLocaleString()} / {item.limit}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="field">
        <label htmlFor="wc-target">Writing goal (target word count)</label>
        <input
          id="wc-target"
          type="number"
          min="0"
          value={targetWordCount}
          onChange={(event) => setTargetWordCount(event.target.value)}
          placeholder="e.g. 500"
        />
        {targetWords > 0 && (
          <>
            <div className="progress-bar wc-goal-bar">
              <div className="progress-bar-fill" style={{ width: `${goalProgress}%` }} />
            </div>
            <p className="field-hint">
              {stats.words.toLocaleString()} / {targetWords.toLocaleString()} words &middot;{' '}
              {goalRemaining.toLocaleString()} remaining &middot; {goalProgress.toFixed(0)}% complete
            </p>
          </>
        )}
      </div>

      <div className="field">
        <div className="field-header">
          <label>Top 10 keywords</label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={ignoreStopWords}
              onChange={(event) => setIgnoreStopWords(event.target.checked)}
            />
            Ignore common words
          </label>
        </div>
        {keywords.length === 0 ? (
          <p className="field-hint">Not enough words yet.</p>
        ) : (
          <dl className="comparison-meta">
            {keywords.map((keyword) => (
              <div key={keyword.word}>
                <dt>{keyword.word}</dt>
                <dd>
                  {keyword.count} &times; ({keyword.percent.toFixed(1)}%)
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <article className="tool-article">
        <p>
          From a quick character count for a tweet to a full readability check on an essay, this
          tool analyzes text as you type — word and character counts, reading time, keyword
          density, readability scores, and a set of one-click cleanup and case-conversion tools —
          entirely in your browser.
        </p>

        <h2>How word counting works</h2>
        <p>
          Words are counted by splitting the text on whitespace — every run of non-space
          characters counts as one word. Sentences and paragraphs use simpler heuristics
          (sentence-ending punctuation, and blank lines) that work well for typical writing but
          aren't true language parsing — an abbreviation like "Mr." can occasionally be
          miscounted as a sentence end, the same limitation every simple word-count tool shares.
        </p>

        <h2>Character count vs. word count</h2>
        <p>
          Word count measures how much you've written in the units people actually think in;
          character count measures raw size, which is what matters for hard limits like a tweet,
          SMS, or meta description. A "word" can be one letter or twenty, so the two numbers
          often diverge — a good reason this tool shows both instead of just one.
        </p>

        <h2>Reading time, explained</h2>
        <p>
          Reading time is estimated from your word count at roughly 200 words per minute — a
          commonly-cited average adult silent-reading speed — and speaking time at roughly 130
          words per minute, a typical spoken pace. Both are estimates: actual speed varies a lot
          by reader, topic difficulty, and formatting.
        </p>

        <h2>Readability scores explained</h2>
        <p>
          The <strong>Flesch Reading Ease</strong> score (0–100, higher is easier) and{' '}
          <strong>Flesch-Kincaid Grade Level</strong> (roughly, the US school grade needed to
          understand the text) are both calculated from average sentence length and average
          syllables per word — shorter sentences and shorter words score as easier to read. They're
          English-specific formulas, and syllable counting here uses a standard estimation
          heuristic rather than a dictionary, so treat the scores as a useful guide, not an exact
          measurement.
        </p>

        <h2>Common writing limits</h2>
        <ul>
          <li><strong>Google Title:</strong> ~60 characters before it gets truncated in search results.</li>
          <li><strong>Meta Description:</strong> ~160 characters before truncation in search results.</li>
          <li><strong>Twitter / X post:</strong> 280 characters per post.</li>
          <li><strong>SMS:</strong> 160 characters per single text message segment.</li>
        </ul>

        <h2>Writing tips</h2>
        <ul>
          <li>Shorter sentences and simpler words consistently improve readability scores — and usually readability itself.</li>
          <li>A high "repeated words" count isn't necessarily bad, but check the keyword list for accidental overuse of one word.</li>
          <li>Use the case converter's Sentence case after drafting in all caps or lowercase, instead of retyping.</li>
          <li>Set a writing goal before drafting long-form content to track progress at a glance.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Why don't the sentence and paragraph counts match what I expect?</h3>
          <p>
            Both use simple punctuation-based heuristics rather than true language parsing, so
            abbreviations, decimal numbers, or unconventional formatting can occasionally throw
            off the count by one or two.
          </p>
        </div>
        <div className="faq-item">
          <h3>What's a good Flesch Reading Ease score?</h3>
          <p>
            60–70 is considered "standard," roughly understandable by 8th–9th graders, and is a
            common target for general-audience writing. Higher scores are easier to read; lower
            scores suit more technical or academic audiences.
          </p>
        </div>
        <div className="faq-item">
          <h3>Does the keyword list include common words like "the" and "and"?</h3>
          <p>
            Not by default — toggle off "Ignore common words" if you want to see raw frequency
            including those.
          </p>
        </div>
        <div className="faq-item">
          <h3>Can I analyze a large document?</h3>
          <p>
            Yes — there's no practical text-length limit for typing or pasting; uploaded .txt
            files are capped at 20 MB, well beyond any normal document.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my text uploaded anywhere?</h3>
          <p>No — every calculation runs locally in your browser; nothing is sent anywhere.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Browse the rest of the <Link to="/category/developer">Developer tools</Link> on Toolbox.
        </p>
      </article>
    </div>
  );
}
