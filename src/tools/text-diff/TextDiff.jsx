import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MODES, buildLineRows, buildPatch, computeDiff, countChanges } from './textDiffUtils.js';

const SAMPLE_ORIGINAL = `The quick brown fox jumps over the lazy dog.
Pack my box with five dozen liquor jugs.
How vexingly quick daft zebras jump!
Sphinx of black quartz, judge my vow.`;

const SAMPLE_CHANGED = `The quick brown fox leaps over the lazy dog.
Pack my box with five dozen liquor jugs.
Sphinx of black quartz, judge my vow.
The five boxing wizards jump quickly.`;

// Renders a line's text, highlighting the changed words when the line was
// edited (not just added or removed).
function LineText({ cell, kind }) {
  if (!cell) return null;
  if (!cell.pieces) return cell.text || ' ';
  return cell.pieces.map((piece, i) =>
    piece.changed ? (
      <mark key={i} className={`diff-word-${kind}`}>
        {piece.text}
      </mark>
    ) : (
      <span key={i}>{piece.text}</span>
    ),
  );
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function TextDiff() {
  const [original, setOriginal] = useState('');
  const [changed, setChanged] = useState('');
  const [mode, setMode] = useState('lines');
  const [view, setView] = useState('split'); // 'split' | 'unified'
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [collapse, setCollapse] = useState(true);
  const [copied, setCopied] = useState(false);

  // Comparing big texts on every keystroke would make typing lag; deferred
  // values let React keep the text boxes responsive and catch the diff up
  // a moment later.
  const deferredOriginal = useDeferredValue(original);
  const deferredChanged = useDeferredValue(changed);
  const hasInput = deferredOriginal !== '' || deferredChanged !== '';

  const changes = useMemo(
    () =>
      hasInput
        ? computeDiff(deferredOriginal, deferredChanged, { mode, ignoreCase, ignoreWhitespace })
        : [],
    [hasInput, deferredOriginal, deferredChanged, mode, ignoreCase, ignoreWhitespace],
  );
  const timedOut = changes === null;
  const stats = useMemo(() => (changes ? countChanges(changes, mode) : null), [changes, mode]);
  const identical = Boolean(changes) && hasInput && stats.added === 0 && stats.removed === 0;
  const rows = useMemo(
    () =>
      changes && mode === 'lines'
        ? buildLineRows(changes, deferredOriginal, deferredChanged, { collapse })
        : [],
    [changes, mode, deferredOriginal, deferredChanged, collapse],
  );

  const unit = mode === 'lines' ? 'line' : mode === 'words' ? 'word' : 'character';
  const plural = (n) => `${n} ${unit}${n === 1 ? '' : 's'}`;

  async function handleCopyPatch() {
    await navigator.clipboard.writeText(buildPatch(original, changed));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="text-diff">
      <div className="diff-inputs">
        <div className="field">
          <label htmlFor="diff-original">Original text</label>
          <textarea
            id="diff-original"
            rows={10}
            value={original}
            spellCheck={false}
            placeholder="Paste the original version here…"
            onChange={(event) => setOriginal(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="diff-changed">Changed text</label>
          <textarea
            id="diff-changed"
            rows={10}
            value={changed}
            spellCheck={false}
            placeholder="Paste the new version here…"
            onChange={(event) => setChanged(event.target.value)}
          />
        </div>
      </div>

      <div className="converter-toolbar">
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            setOriginal(changed);
            setChanged(original);
          }}
          disabled={!original && !changed}
        >
          &#8646; Swap
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            setOriginal('');
            setChanged('');
          }}
          disabled={!original && !changed}
        >
          Clear
        </button>
        {!original && !changed && (
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setOriginal(SAMPLE_ORIGINAL);
              setChanged(SAMPLE_CHANGED);
            }}
          >
            Try an example
          </button>
        )}
      </div>

      <div className="diff-options">
        <div className="mode-toggle" role="radiogroup" aria-label="Compare by">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              className={mode === m.id ? 'mode-button active' : 'mode-button'}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="mode-toggle" role="radiogroup" aria-label="Layout">
          {[
            ['split', 'Side by side'],
            ['unified', 'Inline'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={view === id}
              className={view === id ? 'mode-button active' : 'mode-button'}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="checkbox-field">
          <input type="checkbox" checked={ignoreCase} onChange={(event) => setIgnoreCase(event.target.checked)} />
          Ignore case
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={ignoreWhitespace}
            disabled={mode === 'chars'}
            onChange={(event) => setIgnoreWhitespace(event.target.checked)}
          />
          Ignore whitespace
        </label>
        {mode === 'lines' && (
          <label className="checkbox-field">
            <input type="checkbox" checked={collapse} onChange={(event) => setCollapse(event.target.checked)} />
            Hide unchanged lines
          </label>
        )}
      </div>

      {hasInput && (
        <section className="diff-result" aria-live="polite">
          {timedOut ? (
            <p className="field-error">
              These texts are too large and too different to compare quickly. Try comparing by
              lines, or compare smaller sections.
            </p>
          ) : identical ? (
            <p className="diff-identical">
              No differences{ignoreCase || ignoreWhitespace ? ' (with the selected options)' : ''} - the texts are identical.
            </p>
          ) : (
            <>
              <div className="diff-summary">
                <span className="diff-stat-added">+{plural(stats.added)} added</span>
                <span className="diff-stat-removed">&minus;{plural(stats.removed)} removed</span>
                {mode === 'lines' && (
                  <button type="button" className="ghost-button" onClick={handleCopyPatch}>
                    {copied ? 'Copied!' : 'Copy as patch'}
                  </button>
                )}
              </div>

              {mode === 'lines' ? (
                view === 'split' ? (
                  <div className="diff-table-wrap">
                    <table className="diff-table diff-split">
                      <tbody>
                        {rows.map((row, i) =>
                          row.type === 'skip' ? (
                            <tr key={i} className="diff-skip">
                              <td colSpan={4}>&#8942; {row.count} unchanged line{row.count === 1 ? '' : 's'}</td>
                            </tr>
                          ) : (
                            <tr key={i}>
                              <td className="diff-num">{row.left?.number}</td>
                              <td className={row.left && row.type !== 'same' ? 'diff-cell diff-removed' : row.left ? 'diff-cell' : 'diff-cell diff-empty'}>
                                <LineText cell={row.left} kind="removed" />
                              </td>
                              <td className="diff-num">{row.right?.number}</td>
                              <td className={row.right && row.type !== 'same' ? 'diff-cell diff-added' : row.right ? 'diff-cell' : 'diff-cell diff-empty'}>
                                <LineText cell={row.right} kind="added" />
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="diff-table-wrap">
                    <table className="diff-table diff-unified">
                      <tbody>
                        {rows.flatMap((row, i) => {
                          if (row.type === 'skip') {
                            return [
                              <tr key={i} className="diff-skip">
                                <td colSpan={4}>&#8942; {row.count} unchanged line{row.count === 1 ? '' : 's'}</td>
                              </tr>,
                            ];
                          }
                          if (row.type === 'same') {
                            return [
                              <tr key={i}>
                                <td className="diff-num">{row.left.number}</td>
                                <td className="diff-num">{row.right.number}</td>
                                <td className="diff-sign" />
                                <td className="diff-cell">{row.right.text || ' '}</td>
                              </tr>,
                            ];
                          }
                          const out = [];
                          if (row.left) {
                            out.push(
                              <tr key={`${i}-l`}>
                                <td className="diff-num">{row.left.number}</td>
                                <td className="diff-num" />
                                <td className="diff-sign diff-removed">&minus;</td>
                                <td className="diff-cell diff-removed">
                                  <LineText cell={row.left} kind="removed" />
                                </td>
                              </tr>,
                            );
                          }
                          if (row.right) {
                            out.push(
                              <tr key={`${i}-r`}>
                                <td className="diff-num" />
                                <td className="diff-num">{row.right.number}</td>
                                <td className="diff-sign diff-added">+</td>
                                <td className="diff-cell diff-added">
                                  <LineText cell={row.right} kind="added" />
                                </td>
                              </tr>,
                            );
                          }
                          return out;
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : view === 'split' ? (
                <div className="diff-inline-split">
                  <pre className="diff-inline">
                    {changes.filter((c) => !c.added).map((c, i) =>
                      c.removed ? (
                        <del key={i} className="diff-word-removed">{c.value}</del>
                      ) : (
                        <span key={i}>{c.value}</span>
                      ),
                    )}
                  </pre>
                  <pre className="diff-inline">
                    {changes.filter((c) => !c.removed).map((c, i) =>
                      c.added ? (
                        <ins key={i} className="diff-word-added">{c.value}</ins>
                      ) : (
                        <span key={i}>{c.value}</span>
                      ),
                    )}
                  </pre>
                </div>
              ) : (
                <pre className="diff-inline">
                  {changes.map((c, i) =>
                    c.added ? (
                      <ins key={i} className="diff-word-added">{c.value}</ins>
                    ) : c.removed ? (
                      <del key={i} className="diff-word-removed">{c.value}</del>
                    ) : (
                      <span key={i}>{c.value}</span>
                    ),
                  )}
                </pre>
              )}
            </>
          )}
        </section>
      )}

      <article className="tool-article">
        <p>
          Text Diff compares two versions of a text and shows exactly what changed: lines that
          were added, removed or edited, down to the individual words. Everything runs in your
          browser, so drafts, contracts and code never leave your device.
        </p>

        <h2>How to compare two texts</h2>
        <ol>
          <li>Paste the original version on the left and the changed version on the right.</li>
          <li>The differences appear straight away below - no button to press.</li>
          <li>Choose whether to compare by lines, words or characters, and switch between a side-by-side and an inline view.</li>
        </ol>

        <h2>Lines, words or characters?</h2>
        <ul>
          <li><strong>Lines</strong> is best for code, lists and structured documents. Edited lines are paired up side by side, with the changed words inside them highlighted.</li>
          <li><strong>Words</strong> suits prose: it shows a rewritten sentence as a few swapped words instead of a whole changed paragraph.</li>
          <li><strong>Characters</strong> catches the smallest edits - a changed digit in a number, a missing letter, or swapped punctuation.</li>
        </ul>

        <h2>Ignoring case and whitespace</h2>
        <p>
          <strong>Ignore case</strong> treats &quot;Hello&quot; and &quot;hello&quot; as the same.{' '}
          <strong>Ignore whitespace</strong> skips differences in spaces and indentation, which is
          handy when one version was re-formatted or copied from a PDF. Lines that differ only in
          those ways are then shown as unchanged.
        </p>

        <h2>How it works</h2>
        <p>
          The comparison uses Myers&apos; diff algorithm - the same approach behind{' '}
          <code>git diff</code> - via the open-source jsdiff library. It finds the smallest set of
          insertions and deletions that turns the original into the changed text, which is why the
          highlighted changes match what a person would point out. In line mode you can also copy
          the result as a standard unified patch.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Is my text sent anywhere?</h3>
          <p>No - the comparison runs entirely in your browser and nothing is uploaded or stored.</p>
        </div>
        <div className="faq-item">
          <h3>How large can the texts be?</h3>
          <p>Documents of thousands of lines compare instantly. If two very large texts are almost completely different, the tool stops after a moment instead of freezing your browser and asks you to compare smaller parts.</p>
        </div>
        <div className="faq-item">
          <h3>Can I compare code?</h3>
          <p>Yes - line mode with line numbers is built for it, and &quot;Copy as patch&quot; gives you a unified diff you can apply with <code>git apply</code> or <code>patch</code>.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Count words and analyze readability with the{' '}
          <Link to="/tool/word-counter-text-analyzer">Word Counter &amp; Text Analyzer</Link>, tidy
          up JSON with the <Link to="/tool/json-formatter-validator">JSON Formatter</Link>, or browse
          the rest of the <Link to="/category/text-data">Text &amp; Data tools</Link> on NeatSize.
        </p>
      </article>
    </div>
  );
}
