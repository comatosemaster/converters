import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import {
  BASES,
  BIT_WIDTHS,
  bitLength,
  bitPattern,
  fittingWidth,
  formatInBase,
  groupDigits,
  parseInBase,
} from './numberBaseUtils.js';

const DEFAULT_SOURCE = { field: 'dec', text: '255' };
const CUSTOM_BASES = Array.from({ length: 35 }, (_, i) => i + 2);

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// Every field is editable. The field being typed in keeps exactly what was
// typed; all the others are re-derived from the number it parses to. If
// what's typed isn't valid yet, the others keep the last valid number.

export default function NumberBaseConverter() {
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [lastValid, setLastValid] = useState(255n);
  const [error, setError] = useState('');
  const [customBase, setCustomBase] = useState(36);
  const [uppercase, setUppercase] = useState(true);
  const [grouped, setGrouped] = useState(false);
  const [widthChoice, setWidthChoice] = useState('auto');
  const [copied, setCopied] = useState('');
  const [savedKey, setSavedKey] = useState(`${DEFAULT_SOURCE.field}|${DEFAULT_SOURCE.text}`);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const currentKey = `${source.field}|${source.text}`;
  const hasUnsavedWork = currentKey !== `${DEFAULT_SOURCE.field}|${DEFAULT_SOURCE.text}` && currentKey !== savedKey;
  useUnsavedChangesWarning(hasUnsavedWork);

  const fields = [...BASES, { id: 'custom', base: customBase, label: `Base ${customBase}`, prefix: '', group: 4 }];
  const value = lastValid;

  function baseOf(fieldId, custom = customBase) {
    return fieldId === 'custom' ? custom : BASES.find((b) => b.id === fieldId).base;
  }

  function handleInput(fieldId, text) {
    setSource({ field: fieldId, text });
    const parsed = parseInBase(text, baseOf(fieldId));
    if (parsed.ok) {
      setLastValid(parsed.value);
      setError('');
    } else {
      setError(parsed.error);
    }
  }

  function setValue(next) {
    setLastValid(next);
    setSource({ field: 'dec', text: next.toString() });
    setError('');
  }

  function displayFor(field) {
    if (field.id === source.field) return source.text;
    const digits = formatInBase(value, field.base, { uppercase });
    return grouped ? groupDigits(digits, field.group, field.base === 10 ? ',' : ' ') : digits;
  }

  async function copy(id, text) {
    await navigator.clipboard.writeText(text);
    setSavedKey(currentKey);
    setCopied(id);
    setTimeout(() => setCopied(''), 1500);
  }

  const autoWidth = fittingWidth(value);
  const width = widthChoice === 'auto' ? autoWidth : Number(widthChoice);
  const pattern = width ? bitPattern(value, width) : null;

  function toggleBit(index) {
    // index 0 is the leftmost (most significant) bit of the pattern.
    const bits = pattern.bits.split('');
    bits[index] = bits[index] === '1' ? '0' : '1';
    const flipped = bitPattern(BigInt(`0b${bits.join('')}`), width);
    // A negative number stays in the signed reading, so flipping a low bit
    // of -1 gives -2 rather than jumping to a huge positive number.
    setValue(value < 0n ? flipped.signed : flipped.unsigned);
  }

  return (
    <div className="number-base-converter">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />
      {showResetConfirm && (
        <ConfirmDialog
          title="Reset the number?"
          message="This clears what you entered and goes back to 255."
          confirmLabel="Reset"
          onCancel={() => setShowResetConfirm(false)}
          onConfirm={() => {
            setShowResetConfirm(false);
            handleInput(DEFAULT_SOURCE.field, DEFAULT_SOURCE.text);
          }}
        />
      )}

      <div className="base-fields">
        {fields.map((field) => {
          const shown = displayFor(field);
          const isSource = field.id === source.field;
          return (
            <div className="field base-field" key={field.id}>
              <div className="field-header">
                {field.id === 'custom' ? (
                  <label htmlFor="base-custom-select" className="base-custom-label">
                    Base
                    <select
                      id="base-custom-select"
                      value={customBase}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setCustomBase(next);
                        // Re-read the custom field's text in the new base
                        // only if it's the one being typed in.
                        if (source.field === 'custom') {
                          const parsed = parseInBase(source.text, next);
                          if (parsed.ok) setLastValid(parsed.value);
                          setError(parsed.ok ? '' : parsed.error);
                        }
                      }}
                    >
                      {CUSTOM_BASES.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label htmlFor={`base-${field.id}`}>
                    {field.label} <span className="base-radix">base {field.base}</span>
                  </label>
                )}
                <button
                  type="button"
                  className="ghost-button btn-sm"
                  onClick={() => copy(field.id, formatInBase(value, field.base, { uppercase }))}
                >
                  {copied === field.id ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="base-input-row">
                {field.prefix && <span className="base-prefix">{field.prefix}</span>}
                <input
                  id={field.id === 'custom' ? 'base-custom' : `base-${field.id}`}
                  aria-label={field.id === 'custom' ? `Value in base ${customBase}` : undefined}
                  type="text"
                  inputMode={field.base <= 10 ? 'numeric' : 'text'}
                  value={shown}
                  onChange={(event) => handleInput(field.id, event.target.value)}
                  spellCheck="false"
                  autoComplete="off"
                  aria-invalid={isSource && Boolean(error)}
                />
              </div>
              {isSource && error && <p className="field-error">{error}</p>}
            </div>
          );
        })}
      </div>

      <div className="json-options-row">
        <label className="checkbox-field">
          <input type="checkbox" checked={uppercase} onChange={(event) => setUppercase(event.target.checked)} />
          Uppercase letters
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={grouped} onChange={(event) => setGrouped(event.target.checked)} />
          Group digits
        </label>
        <button
          type="button"
          className="ghost-button"
          onClick={() => setShowResetConfirm(true)}
          disabled={currentKey === `${DEFAULT_SOURCE.field}|${DEFAULT_SOURCE.text}`}
        >
          Reset
        </button>
      </div>

      <section className="base-bits" aria-label="Bit view">
        <div className="field-header">
          <h2 className="pdf-section-heading">Bits</h2>
          <div className="field base-width-field">
            <label htmlFor="base-width">Width</label>
            <select id="base-width" value={widthChoice} onChange={(event) => setWidthChoice(event.target.value)}>
              <option value="auto">Auto{autoWidth ? ` (${autoWidth}-bit)` : ''}</option>
              {BIT_WIDTHS.map((w) => (
                <option key={w} value={w}>{w}-bit</option>
              ))}
            </select>
          </div>
        </div>

        {pattern ? (
          <>
            <div className="base-bit-grid" role="group" aria-label={`${width}-bit pattern - click a bit to flip it`}>
              {/* One block per byte, so lines only ever wrap between whole bytes. */}
              {pattern.bits.match(/.{8}/g).map((byte, b) => (
                <span className="base-byte" key={b}>
                  {byte.split('').map((bit, j) => {
                    const i = b * 8 + j;
                    return (
                      <button
                        key={i}
                        type="button"
                        className={bit === '1' ? 'base-bit on' : 'base-bit'}
                        onClick={() => toggleBit(i)}
                        title={`Bit ${width - 1 - i}`}
                        aria-label={`Bit ${width - 1 - i}: ${bit}`}
                      >
                        {bit}
                      </button>
                    );
                  })}
                </span>
              ))}
            </div>
            <dl className="comparison-meta base-facts">
              <div>
                <dt>As unsigned</dt>
                <dd>{pattern.unsigned.toLocaleString('en-US')}</dd>
              </div>
              <div>
                <dt>As signed (two&apos;s complement)</dt>
                <dd>{pattern.signed.toLocaleString('en-US')}</dd>
              </div>
              <div>
                <dt>Bits needed</dt>
                <dd>
                  {bitLength(value)}
                  {value < 0n ? ' + sign' : ''}
                </dd>
              </div>
              <div>
                <dt>Bytes</dt>
                <dd>{width / 8}</dd>
              </div>
            </dl>
            <p className="field-hint">Click any bit to flip it. Bit 0, on the right, is the least significant.</p>
          </>
        ) : (
          <p className="field-hint">
            {autoWidth === null && widthChoice === 'auto'
              ? 'This number is larger than 128 bits, so there is no fixed-width bit pattern to show - the conversions above are still exact.'
              : `This number doesn't fit in ${width} bits. Choose a wider size.`}
          </p>
        )}
      </section>

      <article className="tool-article">
        <p>
          This number base converter translates numbers between binary, octal, decimal,
          hexadecimal and any base from 2 to 36 as you type. Type into any field and the others
          update. It handles negative numbers and numbers of any length exactly, and shows the
          bit pattern a computer uses to store the value. Everything runs in your browser.
        </p>

        <h2>How number bases work</h2>
        <p>
          A base says how many different digits a number system uses. Decimal (base 10) uses 0-9,
          and each position is worth ten times the one to its right. Binary (base 2) uses only 0
          and 1, so each position is worth twice the previous one: <code>1101</code> in binary is
          8 + 4 + 0 + 1 = 13. Hexadecimal (base 16) adds the letters A-F for the values 10 to 15,
          which makes it a compact way to write binary - every hex digit is exactly four bits, so{' '}
          <code>0xFF</code> is <code>1111 1111</code>.
        </p>

        <h2>Where you meet each base</h2>
        <ul>
          <li><strong>Binary</strong> - bit flags, network masks and how hardware stores data.</li>
          <li><strong>Octal</strong> - Unix file permissions such as <code>chmod 755</code>.</li>
          <li><strong>Hexadecimal</strong> - colors like <code>#5B3DF5</code>, memory addresses, byte dumps, hashes and UUIDs.</li>
          <li><strong>Base 36</strong> - short IDs and URL shorteners, since it uses every digit and letter.</li>
        </ul>

        <h2>Negative numbers and two&apos;s complement</h2>
        <p>
          Computers store negative whole numbers using <strong>two&apos;s complement</strong>: in 8
          bits, -1 is <code>1111 1111</code> - the same bits as 255. Which one it means depends on
          whether the program treats the number as signed or unsigned. The bit view shows both
          readings for 8, 16, 32, 64 and 128-bit widths, which helps when a value from a database,
          a C program or a network packet looks unexpectedly negative or huge.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Can I paste numbers with prefixes or separators?</h3>
          <p>Yes - <code>0x</code>, <code>0o</code> and <code>0b</code> prefixes are understood in their matching fields, and spaces, underscores and (in decimal) commas are ignored, so <code>0xFF_FF</code> and <code>1,000,000</code> both work.</p>
        </div>
        <div className="faq-item">
          <h3>Is there a size limit?</h3>
          <p>No practical one. The converter uses JavaScript&apos;s BigInt, so even 100-digit numbers convert exactly, unlike calculators that round anything above 2<sup>53</sup>.</p>
        </div>
        <div className="faq-item">
          <h3>Does it convert fractions?</h3>
          <p>No - it works with whole numbers, which is what programming, permissions, colors and bit masks use.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Convert colors between HEX and RGB with the <Link to="/tool/color-converter">Color Converter</Link>,
          compute checksums with the <Link to="/tool/hash-generator">Hash Generator</Link>, or browse
          all <Link to="/category/developer">Developer tools</Link>.
        </p>
      </article>
    </div>
  );
}
