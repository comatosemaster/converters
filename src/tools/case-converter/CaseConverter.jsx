import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { CASES } from './caseUtils.js';

const EXAMPLE = 'the quick brown fox jumps over the lazy dog\nuser profile ID\nXMLHttpRequest';

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function CaseConverter() {
  const [text, setText] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const hasUnsavedWork = text.trim() !== '';
  useUnsavedChangesWarning(hasUnsavedWork);
  // Every case is recomputed on each keystroke; deferring keeps typing
  // smooth even when a large document is pasted in.
  const deferredText = useDeferredValue(text);

  async function handleCopy(id, value) {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 1500);
  }

  const results = CASES.map((c) => ({ ...c, value: deferredText ? c.convert(deferredText) : '' }));

  function renderGroup(group, heading) {
    return (
      <section className="case-group" aria-label={heading}>
        <h2 className="pdf-section-heading">{heading}</h2>
        <ul className="case-results">
          {results
            .filter((r) => r.group === group)
            .map((r) => (
              <li key={r.id} className="case-row">
                <div className="case-row-header">
                  <span className="case-name">{r.label}</span>
                  <div className="case-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setText(r.value)}
                      disabled={!r.value || r.value === text}
                      title="Replace the input with this version"
                    >
                      Use
                    </button>
                    <button
                      type="button"
                      className="copy-button"
                      onClick={() => handleCopy(r.id, r.value)}
                      disabled={!r.value}
                    >
                      {copiedId === r.id ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                {r.hint && <p className="field-hint">{r.hint}</p>}
                <pre className="case-value">{r.value || ' '}</pre>
              </li>
            ))}
        </ul>
      </section>
    );
  }

  return (
    <div className="case-converter">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />
      {showClearConfirm && (
        <ConfirmDialog
          title="Clear your text?"
          message="This removes the text you entered. It can't be undone."
          confirmLabel="Clear text"
          onCancel={() => setShowClearConfirm(false)}
          onConfirm={() => {
            setShowClearConfirm(false);
            setText('');
          }}
        />
      )}
      <div className="field">
        <label htmlFor="case-input">Your text</label>
        <textarea
          id="case-input"
          rows={6}
          value={text}
          spellCheck={false}
          placeholder="Type or paste text - every case appears below as you type"
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <div className="converter-toolbar">
        <button type="button" className="ghost-button" onClick={() => setShowClearConfirm(true)} disabled={!text}>
          Clear
        </button>
        {!text && (
          <button type="button" className="ghost-button" onClick={() => setText(EXAMPLE)}>
            Try an example
          </button>
        )}
      </div>

      {renderGroup('writing', 'Writing')}
      {renderGroup('code', 'Programming (each line converted separately)')}

      <article className="tool-article">
        <p>
          Case Converter changes text between capitalization styles in one step - from fixing a
          heading typed in all caps to turning a phrase into a <code>camelCase</code> variable name.
          Every style is shown at once, so you can copy the one you need. It all runs in your
          browser.
        </p>

        <h2>Writing cases</h2>
        <ul>
          <li><strong>Title Case</strong> capitalizes the main words of a headline and keeps short words like &quot;of&quot;, &quot;and&quot; and &quot;the&quot; lowercase, the way newspapers and style guides do. Acronyms you typed in capitals, like NASA, are kept.</li>
          <li><strong>Capitalize Each Word</strong> capitalizes every single word, with no exceptions.</li>
          <li><strong>Sentence case</strong> capitalizes only the first letter of each sentence.</li>
          <li><strong>UPPERCASE</strong> and <strong>lowercase</strong> change every letter; <strong>tOGGLE cASE</strong> flips each letter, which quickly fixes text typed with Caps Lock on.</li>
        </ul>
        <p>Writing cases keep your spacing, line breaks and punctuation exactly as they were.</p>

        <h2>Programming cases</h2>
        <ul>
          <li><strong>camelCase</strong> - JavaScript and Java variables and functions.</li>
          <li><strong>PascalCase</strong> - class and component names.</li>
          <li><strong>snake_case</strong> - Python, Ruby and database columns.</li>
          <li><strong>CONSTANT_CASE</strong> - constants and environment variables.</li>
          <li><strong>kebab-case</strong> - URLs, CSS classes and file names.</li>
          <li><strong>dot.case</strong> and <strong>Train-Case</strong> - configuration keys and HTTP headers.</li>
        </ul>
        <p>
          The converter recognizes words in any existing style, so <code>XMLHttpRequest</code>,{' '}
          <code>user_profile_id</code> and <code>user profile ID</code> all convert cleanly. Paste a
          list with one name per line to convert them all at once.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Does it work with other languages?</h3>
          <p>Yes - accented letters and alphabets such as Cyrillic and Greek are fully supported. Georgian is handled the Georgian way: UPPERCASE turns it into Mtavruli capitals, but Title and Sentence case leave it alone, since Georgian doesn&apos;t capitalize the first letter of words. Scripts without capitals, like Chinese, are left unchanged.</p>
        </div>
        <div className="faq-item">
          <h3>Is my text stored or sent anywhere?</h3>
          <p>No - conversion happens instantly in your browser and nothing is uploaded or saved.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Count words and clean up text with the{' '}
          <Link to="/tool/word-counter-text-analyzer">Word Counter &amp; Text Analyzer</Link>, compare
          two versions with the <Link to="/tool/text-diff">Text Diff Checker</Link>, or browse all{' '}
          <Link to="/category/text-data">Text &amp; Data tools</Link>.
        </p>
      </article>
    </div>
  );
}
