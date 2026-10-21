import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import { FORMATS, MAX_COUNT, VERSIONS, formatUuid, generate, inspectUuid } from './uuidUtils.js';

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function UuidGenerator() {
  const [version, setVersion] = useState('v4');
  const [count, setCount] = useState(1);
  const [format, setFormat] = useState('standard');
  const [uppercase, setUppercase] = useState(false);
  // Raw (lowercase, hyphenated) UUIDs; formatting is applied on display.
  // Starts empty: the page is prerendered at build time, and IDs generated
  // there would differ from the browser's - so the first batch is made
  // only once the page is running in the browser.
  const [uuids, setUuids] = useState([]);
  const [copied, setCopied] = useState('');
  const [inspectInput, setInspectInput] = useState('');
  // The batch last copied or downloaded (or the automatic first one). A
  // batch the user generated and hasn't saved yet is worth a warning; the
  // ID that simply appears when the page opens is not.
  const [savedBatch, setSavedBatch] = useState(null);
  const hasUnsavedWork = (uuids.length > 0 && uuids !== savedBatch) || inspectInput.trim() !== '';
  useUnsavedChangesWarning(hasUnsavedWork);

  const safeCount = Math.min(MAX_COUNT, Math.max(1, Math.floor(Number(count)) || 1));

  function regenerate(nextVersion = version, nextCount = safeCount) {
    setUuids(generate(nextVersion, nextCount));
  }

  useEffect(() => {
    const first = generate(version, safeCount);
    setUuids(first);
    setSavedBatch(first);
    // Only on mount - later batches are made explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lines = useMemo(() => uuids.map((u) => formatUuid(u, format, uppercase)), [uuids, format, uppercase]);
  const allText = lines.join('\n');

  const downloadUrl = useMemo(
    () => (lines.length > 1 ? URL.createObjectURL(new Blob([`${allText}\n`], { type: 'text/plain' })) : ''),
    [lines, allText],
  );
  useEffect(() => () => downloadUrl && URL.revokeObjectURL(downloadUrl), [downloadUrl]);

  async function copy(text, key) {
    await navigator.clipboard.writeText(text);
    if (key === 'all' || uuids.length === 1) setSavedBatch(uuids);
    setCopied(key);
    setTimeout(() => setCopied(''), 1500);
  }

  const inspected = inspectInput.trim() ? inspectUuid(inspectInput) : null;

  return (
    <div className="uuid-generator">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />
      <div className="unit-converter-row">
        <div className="field">
          <label htmlFor="uuid-version">Type</label>
          <select
            id="uuid-version"
            value={version}
            onChange={(event) => {
              setVersion(event.target.value);
              regenerate(event.target.value);
            }}
          >
            {VERSIONS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="uuid-count">How many (1-{MAX_COUNT})</label>
          <input
            id="uuid-count"
            type="number"
            min={1}
            max={MAX_COUNT}
            value={count}
            onChange={(event) => setCount(event.target.value)}
            onBlur={() => setCount(safeCount)}
            onKeyDown={(event) => event.key === 'Enter' && regenerate()}
          />
        </div>
        <div className="field">
          <label htmlFor="uuid-format">Format</label>
          <select id="uuid-format" value={format} onChange={(event) => setFormat(event.target.value)}>
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="hash-options">
        <label className="checkbox-field">
          <input type="checkbox" checked={uppercase} onChange={(event) => setUppercase(event.target.checked)} />
          Uppercase
        </label>
      </div>

      <div className="converter-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => regenerate()}>
          Generate {safeCount > 1 ? `${safeCount} UUIDs` : 'new UUID'}
        </button>
        <button type="button" className="ghost-button" onClick={() => copy(allText, 'all')} disabled={!lines.length}>
          {copied === 'all' ? 'Copied!' : lines.length > 1 ? `Copy all ${lines.length}` : 'Copy'}
        </button>
        {downloadUrl && (
          <a className="ghost-button" href={downloadUrl} download={`uuids-${version}.txt`} onClick={() => setSavedBatch(uuids)}>
            Download .txt
          </a>
        )}
      </div>

      {lines.length <= 1 ? (
        <div className="uuid-single">
          {/* Empty only for the instant before the first UUID is made. */}
          <code className="uuid-single-value">{lines[0] ?? ' '}</code>
        </div>
      ) : (
        <ol className="uuid-list" aria-label="Generated UUIDs">
          {lines.map((line, i) => (
            <li key={uuids[i]}>
              <code>{line}</code>
              <button type="button" className="copy-button" onClick={() => copy(line, uuids[i])}>
                {copied === uuids[i] ? 'Copied!' : 'Copy'}
              </button>
            </li>
          ))}
        </ol>
      )}

      <h2 className="pdf-section-heading">Inspect a UUID</h2>
      <div className="field">
        <label htmlFor="uuid-inspect">Paste any UUID or GUID to validate and decode it</label>
        <input
          id="uuid-inspect"
          type="text"
          value={inspectInput}
          spellCheck={false}
          autoComplete="off"
          placeholder="e.g. 0190c2a4-6f2e-7c3a-9b1d-2f5e8a7c4d10"
          onChange={(event) => setInspectInput(event.target.value)}
        />
        {inspected && !inspected.ok && <p className="field-error">{inspected.error}</p>}
        {inspected?.ok && (
          <dl className="comparison-meta uuid-inspect-result">
            <div>
              <dt>Valid</dt>
              <dd>Yes</dd>
            </div>
            <div>
              <dt>Canonical form</dt>
              <dd>
                <code>{inspected.canonical}</code>
              </dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{inspected.version}</dd>
            </div>
            <div>
              <dt>Variant</dt>
              <dd>{inspected.variant}</dd>
            </div>
            {inspected.timestamp && !Number.isNaN(inspected.timestamp.getTime()) && (
              <div>
                <dt>Created</dt>
                <dd>
                  {inspected.timestamp.toISOString().replace('T', ' ').replace('Z', ' UTC')}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>

      <article className="tool-article">
        <p>
          A UUID (universally unique identifier, also called a GUID) is a 128-bit ID like{' '}
          <code>8f14e45f-ceea-467f-a0e6-9b5d6c5f2a1b</code> that can be created anywhere, by anyone,
          without coordination - and still never collide in practice. This generator makes them in
          your browser using its cryptographically secure random number generator.
        </p>

        <h2>Version 4 or version 7?</h2>
        <ul>
          <li>
            <strong>Version 4</strong> is 122 bits of pure randomness. It reveals nothing about when
            or where it was made, which makes it the safe default for public IDs and tokens.
          </li>
          <li>
            <strong>Version 7</strong> starts with the current time in milliseconds, so UUIDs sort in
            the order they were created. Databases love this: new rows land at the end of the
            index instead of scattered through it, keeping inserts fast. The trade-off is that
            anyone can read the creation time from the ID.
          </li>
        </ul>
        <p>
          A batch of version 7 UUIDs generated together is guaranteed to stay in order, even within
          the same millisecond, thanks to a built-in counter (as described in RFC 9562).
        </p>

        <h2>Formats</h2>
        <ul>
          {FORMATS.map((f) => (
            <li key={f.id}>
              <strong>{f.label}</strong>: <code>{f.example}</code>
            </li>
          ))}
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Can two UUIDs ever be the same?</h3>
          <p>In theory, yes; in practice, no. You would need to generate about a billion version 4 UUIDs every second for 85 years to reach even a 50% chance of a single duplicate.</p>
        </div>
        <div className="faq-item">
          <h3>Is a UUID the same as a GUID?</h3>
          <p>Yes - GUID is Microsoft&apos;s name for the same thing. Some Microsoft tools show them in braces and uppercase, which the Format options can match.</p>
        </div>
        <div className="faq-item">
          <h3>Are these UUIDs safe to use as secrets?</h3>
          <p>Version 4 UUIDs from this tool are cryptographically random, but a UUID is an identifier, not a password. For secrets, use a dedicated <Link to="/tool/password-generator">password generator</Link> with more entropy.</p>
        </div>
        <div className="faq-item">
          <h3>Is anything sent to a server?</h3>
          <p>No - UUIDs are generated and inspected entirely in your browser.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Also try the <Link to="/tool/hash-generator">Hash Generator</Link>, the{' '}
          <Link to="/tool/password-generator">Password Generator</Link>, or browse all{' '}
          <Link to="/category/developer">Developer tools</Link>.
        </p>
      </article>
    </div>
  );
}
