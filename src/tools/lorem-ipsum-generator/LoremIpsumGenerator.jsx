import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import { OUTPUTS, UNITS, countStats, formatLorem, generateLorem } from './loremUtils.js';

const DOWNLOAD_TYPES = {
  text: ['txt', 'text/plain'],
  html: ['html', 'text/html'],
  markdown: ['md', 'text/markdown'],
};

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// Text is generated only in the browser, never while the page is
// prerendered: random text would differ between the two (a hydration
// mismatch), and a page full of fake Latin is the last thing search
// engines should index for this tool.

export default function LoremIpsumGenerator() {
  const [unit, setUnit] = useState('paragraphs');
  const [counts, setCounts] = useState(() => Object.fromEntries(UNITS.map((u) => [u.id, u.default])));
  const [classic, setClassic] = useState(true);
  const [output, setOutput] = useState('text');
  const [result, setResult] = useState(null); // { blocks, kind }
  const [copied, setCopied] = useState(false);
  // The batch the user last copied or downloaded - or the first one,
  // made automatically when the page opens, which isn't the user's work.
  const [savedResult, setSavedResult] = useState(null);
  // Set once the user changes a setting; until then, generated text is
  // the page's own starting content rather than something to protect.
  const userTouched = useRef(false);

  const unitInfo = UNITS.find((u) => u.id === unit);
  const count = Math.min(unitInfo.max, Math.max(1, Math.floor(Number(counts[unit])) || 1));

  // Regenerates whenever what's being asked for changes, like the other
  // generators on the site update as you adjust them.
  useEffect(() => {
    const next = generateLorem({ unit, count, classic });
    setResult(next);
    if (!userTouched.current) setSavedResult(next);
  }, [unit, count, classic]);

  const hasUnsavedWork = result !== null && result !== savedResult;
  useUnsavedChangesWarning(hasUnsavedWork);

  const text = result ? formatLorem(result, output) : '';
  const stats = countStats(text);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setSavedResult(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleDownload() {
    const [extension, type] = DOWNLOAD_TYPES[output];
    const url = URL.createObjectURL(new Blob([`${text}\n`], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `lorem-ipsum.${extension}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSavedResult(result);
  }

  return (
    <div className="lorem-generator">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      <div className="mode-toggle" role="radiogroup" aria-label="Generate">
        {UNITS.map((u) => (
          <button
            key={u.id}
            type="button"
            role="radio"
            aria-checked={unit === u.id}
            className={unit === u.id ? 'mode-button active' : 'mode-button'}
            onClick={() => {
              userTouched.current = true;
              setUnit(u.id);
            }}
          >
            {u.label}
          </button>
        ))}
      </div>

      <div className="json-options-row">
        <div className="field lorem-count">
          <label htmlFor="lorem-count">
            How many {unitInfo.label.toLowerCase()} (1-{unitInfo.max.toLocaleString()})
          </label>
          <input
            id="lorem-count"
            type="number"
            min={1}
            max={unitInfo.max}
            value={counts[unit]}
            onChange={(event) => {
              userTouched.current = true;
              setCounts((prev) => ({ ...prev, [unit]: event.target.value }));
            }}
            onBlur={() => setCounts((prev) => ({ ...prev, [unit]: count }))}
          />
        </div>
        <div className="field">
          <label htmlFor="lorem-output">Format</label>
          <select id="lorem-output" value={output} onChange={(event) => setOutput(event.target.value)}>
            {OUTPUTS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <label className="checkbox-field">
          <input type="checkbox" checked={classic} onChange={(event) => {
            userTouched.current = true;
            setClassic(event.target.checked);
          }} />
          Start with &quot;Lorem ipsum dolor sit amet&quot;
        </label>
      </div>

      <div className="converter-toolbar json-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => {
            userTouched.current = true;
            setResult(generateLorem({ unit, count, classic }));
          }}>
          Generate new text
        </button>
        <button type="button" className="copy-button" onClick={handleCopy} disabled={!text}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button type="button" className="ghost-button" onClick={handleDownload} disabled={!text}>
          Download .{DOWNLOAD_TYPES[output][0]}
        </button>
        <span className="field-hint lorem-stats">
          {stats.words.toLocaleString()} words · {stats.characters.toLocaleString()} characters
        </span>
      </div>

      {output === 'text' && result?.kind !== 'list' ? (
        <div className="lorem-output" aria-live="polite">
          {result?.blocks.map((block, i) => <p key={i}>{block}</p>)}
        </div>
      ) : (
        <pre className="gradient-css-block lorem-code" aria-live="polite">
          <code>{text}</code>
        </pre>
      )}

      <article className="tool-article">
        <p>
          This lorem ipsum generator creates placeholder text for designs, mockups, websites and
          print layouts. Choose paragraphs, sentences, words, an exact number of characters or a
          list, then copy it as plain text, HTML or Markdown. Sentences and paragraphs vary in
          length like real writing, so your layout is tested with something close to real copy.
        </p>

        <h2>What is lorem ipsum?</h2>
        <p>
          Lorem ipsum is scrambled Latin taken from <em>De finibus bonorum et malorum</em>, a book
          on ethics written by Cicero in 45 BC. Printers have used it as filler text since the
          1500s, and it became standard in desktop publishing and web design. Because it is not
          readable English, people judge the layout - type, spacing and line length - instead of
          getting distracted by what the words say.
        </p>

        <h2>Choosing the right amount</h2>
        <ul>
          <li><strong>Paragraphs</strong> - articles, blog layouts and long-form pages.</li>
          <li><strong>Sentences</strong> - card descriptions, intros and short blurbs.</li>
          <li><strong>Words</strong> - headings, buttons and titles.</li>
          <li><strong>Characters</strong> - exact-length text for testing limits, such as a 160-character meta description or a 280-character post.</li>
          <li><strong>List items</strong> - navigation menus, feature lists and bullet points, as an HTML <code>&lt;ul&gt;</code> or a Markdown list.</li>
        </ul>

        <h2>Tips for using placeholder text</h2>
        <p>
          Test with more and less text than you expect - real content is rarely the perfect
          length, and a heading that wraps onto three lines or a card with one short sentence will
          show where a design breaks. Replace placeholder text before launch: it is easy to miss on
          a rarely visited page, and search engines treat it as low-quality content.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Is lorem ipsum free to use?</h3>
          <p>Yes. The text is over 2,000 years old and in the public domain, so you can use it anywhere, including commercial projects.</p>
        </div>
        <div className="faq-item">
          <h3>Does the text change every time?</h3>
          <p>Yes - each click on <strong>Generate new text</strong> creates a new random selection. Turn on &quot;Start with Lorem ipsum dolor sit amet&quot; to begin with the familiar opening line.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Check the length of your real text with the{' '}
          <Link to="/tool/word-counter-text-analyzer">Word Counter &amp; Text Analyzer</Link>, change its
          capitalization with the <Link to="/tool/case-converter">Case Converter</Link>, or browse
          all <Link to="/category/text-data">Text &amp; Data tools</Link>.
        </p>
      </article>
    </div>
  );
}
