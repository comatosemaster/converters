import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import { buildQrPayload, isTypeEmpty } from './qrPayloads.js';

// --- Fixed option lists ---------------------------------------------------------

const QR_TYPES = [
  { id: 'url', label: 'URL' },
  { id: 'text', label: 'Text' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
  { id: 'sms', label: 'SMS' },
  { id: 'wifi', label: 'WiFi' },
  { id: 'vcard', label: 'Contact' },
  { id: 'location', label: 'Location' },
];

const ERROR_CORRECTION_LEVELS = [
  { value: 'L', label: 'L - Low (~7% recovery)' },
  { value: 'M', label: 'M - Medium (~15% recovery)' },
  { value: 'Q', label: 'Q - Quartile (~25% recovery)' },
  { value: 'H', label: 'H - High (~30% recovery)' },
];

const WIFI_SECURITY_OPTIONS = [
  { value: 'WPA', label: 'WPA/WPA2' },
  { value: 'WEP', label: 'WEP' },
  { value: 'nopass', label: 'None (open network)' },
];

// --- Defaults, also used as the "pristine" baseline for the unsaved-work check --

const DEFAULT_TYPE = 'url';
const DEFAULT_FIELDS = {
  url: '',
  text: '',
  emailAddress: '',
  emailSubject: '',
  emailMessage: '',
  phone: '',
  smsPhone: '',
  smsMessage: '',
  wifiSsid: '',
  wifiPassword: '',
  wifiSecurity: 'WPA',
  vcardFirstName: '',
  vcardLastName: '',
  vcardCompany: '',
  vcardTitle: '',
  vcardPhone: '',
  vcardEmail: '',
  vcardWebsite: '',
  vcardAddress: '',
  lat: '',
  lng: '',
};
const DEFAULT_SIZE = 300;
const DEFAULT_MARGIN = 4;
const DEFAULT_ERROR_CORRECTION = 'M';
const DEFAULT_FOREGROUND = '#000000';
const DEFAULT_BACKGROUND = '#ffffff';

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// The payload-building/validation logic lives in qrPayloads.js - this
// file is just the UI and the actual QR image generation wired up to it.

export default function QrCodeGenerator() {
  const [type, setType] = useState(DEFAULT_TYPE);
  // All fields across every QR type live in one object, so switching tabs
  // and back doesn't lose what you typed on the other tab.
  const [fields, setFields] = useState(DEFAULT_FIELDS);

  const [size, setSize] = useState(DEFAULT_SIZE);
  const [margin, setMargin] = useState(DEFAULT_MARGIN);
  const [errorCorrectionLevel, setErrorCorrectionLevel] = useState(DEFAULT_ERROR_CORRECTION);
  const [foregroundColor, setForegroundColor] = useState(DEFAULT_FOREGROUND);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BACKGROUND);
  const [transparentBackground, setTransparentBackground] = useState(false);

  const [qrDataUrl, setQrDataUrl] = useState(''); // PNG, for the preview + PNG download
  const [qrSvg, setQrSvg] = useState(''); // SVG markup, for SVG download/copy
  const [svgBlobUrl, setSvgBlobUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedSvg, setCopiedSvg] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);

  useDocumentMeta({
    title: 'QR Code Generator - URL, WiFi, vCard & More | Rootconverter',
    description:
      'Generate customizable QR codes for URLs, text, email, phone, SMS, WiFi, contacts, and locations entirely in your browser. PNG and SVG export, no upload required.',
  });

  function updateField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  const validation = buildQrPayload(type, fields);
  const isEmpty = isTypeEmpty(type, fields);

  // Regenerates the QR image whenever the payload or any customization
  // option changes. Both PNG (for the preview + PNG export) and SVG (for
  // SVG export/copy) are built together since they're cheap and both
  // useful to have ready immediately.
  useEffect(() => {
    if (!validation.ok) {
      setQrDataUrl('');
      setQrSvg('');
      return;
    }

    let cancelled = false;
    setIsGenerating(true);
    setGenError('');

    const lightColor = transparentBackground ? `${backgroundColor}00` : backgroundColor;
    const options = {
      width: size,
      margin,
      errorCorrectionLevel,
      color: { dark: foregroundColor, light: lightColor },
    };

    (async () => {
      try {
        // qrcode is only needed here, so it's imported dynamically rather
        // than bundled into every page's initial download.
        const { toDataURL, toString: qrToString } = await import('qrcode');
        const [dataUrl, svg] = await Promise.all([
          toDataURL(validation.payload, options),
          qrToString(validation.payload, { ...options, type: 'svg' }),
        ]);
        if (cancelled) return;
        setQrDataUrl(dataUrl);
        setQrSvg(svg);
      } catch {
        if (!cancelled) setGenError('Could not generate a QR code for this input.');
      } finally {
        if (!cancelled) setIsGenerating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    validation.ok,
    validation.payload,
    size,
    margin,
    errorCorrectionLevel,
    foregroundColor,
    backgroundColor,
    transparentBackground,
  ]);

  // Builds a downloadable .svg file whenever the SVG markup changes.
  useEffect(() => {
    if (!qrSvg) {
      setSvgBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      return;
    }
    const url = URL.createObjectURL(new Blob([qrSvg], { type: 'image/svg+xml' }));
    setSvgBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [qrSvg]);

  function handleClear() {
    setType(DEFAULT_TYPE);
    setFields(DEFAULT_FIELDS);
    setSize(DEFAULT_SIZE);
    setMargin(DEFAULT_MARGIN);
    setErrorCorrectionLevel(DEFAULT_ERROR_CORRECTION);
    setForegroundColor(DEFAULT_FOREGROUND);
    setBackgroundColor(DEFAULT_BACKGROUND);
    setTransparentBackground(false);
    setGenError('');
  }

  async function handleCopyImage() {
    if (!qrDataUrl) return;
    try {
      const response = await fetch(qrDataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 1500);
    } catch {
      setGenError("Your browser doesn't support copying images - try downloading instead.");
    }
  }

  async function handleCopySvg() {
    if (!qrSvg) return;
    await navigator.clipboard.writeText(qrSvg);
    setCopiedSvg(true);
    setTimeout(() => setCopiedSvg(false), 1500);
  }

  async function handleCopyPayload() {
    if (!validation.ok) return;
    await navigator.clipboard.writeText(validation.payload);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 1500);
  }

  // "Unsaved work" is anything that differs from the pristine defaults -
  // matches this tool's own spec (switching type, tweaking a color, typing
  // a field all count), and Clear resets every one of these back to
  // baseline, which is what turns the flag back off.
  const hasUnsavedWork =
    type !== DEFAULT_TYPE ||
    Object.entries(fields).some(([key, value]) => value !== DEFAULT_FIELDS[key]) ||
    size !== DEFAULT_SIZE ||
    margin !== DEFAULT_MARGIN ||
    errorCorrectionLevel !== DEFAULT_ERROR_CORRECTION ||
    foregroundColor !== DEFAULT_FOREGROUND ||
    backgroundColor !== DEFAULT_BACKGROUND ||
    transparentBackground !== false;
  useUnsavedChangesWarning(hasUnsavedWork);

  return (
    <div className="qr-generator">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      <div className="mode-toggle" role="radiogroup" aria-label="QR code type">
        {QR_TYPES.map((qrType) => (
          <button
            key={qrType.id}
            type="button"
            className={type === qrType.id ? 'mode-button active' : 'mode-button'}
            aria-pressed={type === qrType.id}
            onClick={() => setType(qrType.id)}
          >
            {qrType.label}
          </button>
        ))}
      </div>

      <div className="qr-layout">
        <div className="qr-fields">
          {type === 'url' && (
            <div className="field">
              <label htmlFor="qr-url">Website URL</label>
              <input
                id="qr-url"
                type="text"
                value={fields.url}
                onChange={(event) => updateField('url', event.target.value)}
                placeholder="https://example.com"
              />
            </div>
          )}

          {type === 'text' && (
            <div className="field">
              <label htmlFor="qr-text">Text</label>
              <textarea
                id="qr-text"
                rows={4}
                value={fields.text}
                onChange={(event) => updateField('text', event.target.value)}
                placeholder="Any text you like…"
              />
            </div>
          )}

          {type === 'email' && (
            <>
              <div className="field">
                <label htmlFor="qr-email-address">Email address</label>
                <input
                  id="qr-email-address"
                  type="email"
                  value={fields.emailAddress}
                  onChange={(event) => updateField('emailAddress', event.target.value)}
                  placeholder="name@example.com"
                />
              </div>
              <div className="field">
                <label htmlFor="qr-email-subject">Subject (optional)</label>
                <input
                  id="qr-email-subject"
                  type="text"
                  value={fields.emailSubject}
                  onChange={(event) => updateField('emailSubject', event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="qr-email-message">Message (optional)</label>
                <textarea
                  id="qr-email-message"
                  rows={3}
                  value={fields.emailMessage}
                  onChange={(event) => updateField('emailMessage', event.target.value)}
                />
              </div>
            </>
          )}

          {type === 'phone' && (
            <div className="field">
              <label htmlFor="qr-phone">Phone number</label>
              <input
                id="qr-phone"
                type="tel"
                value={fields.phone}
                onChange={(event) => updateField('phone', event.target.value)}
                placeholder="+1 555 123 4567"
              />
            </div>
          )}

          {type === 'sms' && (
            <>
              <div className="field">
                <label htmlFor="qr-sms-phone">Phone number</label>
                <input
                  id="qr-sms-phone"
                  type="tel"
                  value={fields.smsPhone}
                  onChange={(event) => updateField('smsPhone', event.target.value)}
                  placeholder="+1 555 123 4567"
                />
              </div>
              <div className="field">
                <label htmlFor="qr-sms-message">Message (optional)</label>
                <textarea
                  id="qr-sms-message"
                  rows={3}
                  value={fields.smsMessage}
                  onChange={(event) => updateField('smsMessage', event.target.value)}
                />
              </div>
            </>
          )}

          {type === 'wifi' && (
            <>
              <div className="field">
                <label htmlFor="qr-wifi-ssid">Network name (SSID)</label>
                <input
                  id="qr-wifi-ssid"
                  type="text"
                  value={fields.wifiSsid}
                  onChange={(event) => updateField('wifiSsid', event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="qr-wifi-security">Security type</label>
                <select
                  id="qr-wifi-security"
                  value={fields.wifiSecurity}
                  onChange={(event) => updateField('wifiSecurity', event.target.value)}
                >
                  {WIFI_SECURITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              {fields.wifiSecurity !== 'nopass' && (
                <div className="field">
                  <label htmlFor="qr-wifi-password">Password</label>
                  <input
                    id="qr-wifi-password"
                    type="text"
                    value={fields.wifiPassword}
                    onChange={(event) => updateField('wifiPassword', event.target.value)}
                  />
                </div>
              )}
            </>
          )}

          {type === 'vcard' && (
            <>
              <div className="field">
                <label htmlFor="qr-vcard-first">First name</label>
                <input
                  id="qr-vcard-first"
                  type="text"
                  value={fields.vcardFirstName}
                  onChange={(event) => updateField('vcardFirstName', event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="qr-vcard-last">Last name</label>
                <input
                  id="qr-vcard-last"
                  type="text"
                  value={fields.vcardLastName}
                  onChange={(event) => updateField('vcardLastName', event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="qr-vcard-company">Company (optional)</label>
                <input
                  id="qr-vcard-company"
                  type="text"
                  value={fields.vcardCompany}
                  onChange={(event) => updateField('vcardCompany', event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="qr-vcard-title">Job title (optional)</label>
                <input
                  id="qr-vcard-title"
                  type="text"
                  value={fields.vcardTitle}
                  onChange={(event) => updateField('vcardTitle', event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="qr-vcard-phone">Phone (optional)</label>
                <input
                  id="qr-vcard-phone"
                  type="tel"
                  value={fields.vcardPhone}
                  onChange={(event) => updateField('vcardPhone', event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="qr-vcard-email">Email (optional)</label>
                <input
                  id="qr-vcard-email"
                  type="email"
                  value={fields.vcardEmail}
                  onChange={(event) => updateField('vcardEmail', event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="qr-vcard-website">Website (optional)</label>
                <input
                  id="qr-vcard-website"
                  type="text"
                  value={fields.vcardWebsite}
                  onChange={(event) => updateField('vcardWebsite', event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="qr-vcard-address">Address (optional)</label>
                <input
                  id="qr-vcard-address"
                  type="text"
                  value={fields.vcardAddress}
                  onChange={(event) => updateField('vcardAddress', event.target.value)}
                />
              </div>
            </>
          )}

          {type === 'location' && (
            <>
              <div className="field">
                <label htmlFor="qr-lat">Latitude</label>
                <input
                  id="qr-lat"
                  type="text"
                  inputMode="decimal"
                  value={fields.lat}
                  onChange={(event) => updateField('lat', event.target.value)}
                  placeholder="-90 to 90"
                />
              </div>
              <div className="field">
                <label htmlFor="qr-lng">Longitude</label>
                <input
                  id="qr-lng"
                  type="text"
                  inputMode="decimal"
                  value={fields.lng}
                  onChange={(event) => updateField('lng', event.target.value)}
                  placeholder="-180 to 180"
                />
              </div>
            </>
          )}

          <div className="qr-customization">
            <div className="field">
              <label htmlFor="qr-size">Size: {size}px</label>
              <input
                id="qr-size"
                type="range"
                min="128"
                max="1024"
                step="8"
                value={size}
                onChange={(event) => setSize(Number(event.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="qr-margin">Margin: {margin} modules</label>
              <input
                id="qr-margin"
                type="range"
                min="0"
                max="10"
                value={margin}
                onChange={(event) => setMargin(Number(event.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="qr-error-correction">Error correction level</label>
              <select
                id="qr-error-correction"
                value={errorCorrectionLevel}
                onChange={(event) => setErrorCorrectionLevel(event.target.value)}
              >
                {ERROR_CORRECTION_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="qr-color-row">
              <div className="field">
                <label htmlFor="qr-foreground">Foreground</label>
                <input
                  id="qr-foreground"
                  type="color"
                  className="color-picker"
                  value={foregroundColor}
                  onChange={(event) => setForegroundColor(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="qr-background">Background</label>
                <input
                  id="qr-background"
                  type="color"
                  className="color-picker"
                  value={backgroundColor}
                  disabled={transparentBackground}
                  onChange={(event) => setBackgroundColor(event.target.value)}
                />
              </div>
            </div>

            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={transparentBackground}
                onChange={(event) => setTransparentBackground(event.target.checked)}
              />
              Transparent background
            </label>
          </div>

          <button type="button" className="ghost-button" onClick={handleClear}>
            Clear
          </button>
        </div>

        <div className="qr-preview-column">
          {isEmpty ? (
            <p className="category-empty">Fill in the fields to generate a QR code.</p>
          ) : !validation.ok ? (
            <p className="field-error">{validation.error}</p>
          ) : (
            <>
              {genError && <p className="field-error">{genError}</p>}

              <div className="qr-preview-frame">
                {qrDataUrl && <img src={qrDataUrl} alt="Generated QR code" className="qr-preview-image" />}
              </div>

              <p className="field-hint">
                {size}px &middot; Error correction {errorCorrectionLevel}
                {isGenerating && ' · Regenerating…'}
              </p>

              <div className="mode-toggle">
                <button type="button" className="copy-button" onClick={handleCopyImage} disabled={!qrDataUrl}>
                  {copiedImage ? 'Copied!' : 'Copy image'}
                </button>
                <button type="button" className="copy-button" onClick={handleCopySvg} disabled={!qrSvg}>
                  {copiedSvg ? 'Copied!' : 'Copy SVG'}
                </button>
              </div>

              <div className="mode-toggle">
                <a className="download-button" href={qrDataUrl} download="qr-code.png">
                  Download PNG
                </a>
                <a className="download-button" href={svgBlobUrl} download="qr-code.svg">
                  Download SVG
                </a>
              </div>

              <details className="qr-payload-details">
                <summary>Show QR payload</summary>
                <div className="field-header">
                  <span className="field-hint">What's actually encoded in the QR code</span>
                  <button type="button" className="copy-button" onClick={handleCopyPayload}>
                    {copiedPayload ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="qr-payload-text">{validation.payload}</pre>
              </details>
            </>
          )}
        </div>
      </div>

      <article className="tool-article">
        <p>
          QR codes pack a URL, WiFi login, contact card, or plain text into a scannable square -
          any phone camera can read one instantly. This tool builds all the common types and
          renders them entirely in your browser, so nothing you type is ever sent anywhere.
        </p>

        <h2>How QR codes work</h2>
        <p>
          A QR code is a grid of black and white squares ("modules") that encode data using the
          same kind of error-correcting math used in CDs and satellite transmissions. A scanner
          reads the pattern, corrects for minor damage or glare using that redundancy, and
          recovers the original text - which is just a specially-formatted string (like{' '}
          <code>WIFI:T:WPA;S:MyNetwork;P:mypassword;;</code>) that the phone's OS then knows how
          to act on, whether that's opening a URL, joining a network, or saving a contact.
        </p>

        <h2>QR code error correction explained</h2>
        <p>
          Every QR code includes redundant data so it can still be read even if part of it is
          dirty, damaged, or partially obscured (for example, by a logo placed in the middle).
          Higher error correction levels survive more damage but pack less usable data into the
          same size, so the code needs to be denser: <strong>L</strong> (~7% recoverable) fits the
          most data, up to <strong>H</strong> (~30% recoverable) for codes that need to hold up in
          rougher conditions, like being printed small or exposed to wear.
        </p>

        <h2>Static vs dynamic QR codes</h2>
        <p>
          The QR codes this tool generates are <strong>static</strong> - the destination or data
          is encoded directly into the code itself, permanently. <strong>Dynamic</strong> QR
          codes (offered by some paid services) instead encode a short redirect URL that you can
          repoint later without reprinting the code - useful for tracking scans or changing a
          destination after printing, at the cost of depending on that service staying online.
          For most personal and one-off uses, a static code (like the ones here) is simpler and
          has no ongoing dependency.
        </p>

        <h2>Best practices</h2>
        <ul>
          <li>Keep the error correction level at M or higher if the code will be printed small or handled physically.</li>
          <li>Leave the margin (quiet zone) intact - cropping it too tight can make codes unreadable to some scanners.</li>
          <li>Test a printed code with more than one phone/scanner app before distributing it widely.</li>
          <li>Use high contrast between foreground and background - QR codes rely on that contrast to be readable at all.</li>
        </ul>

        <h2>Common mistakes</h2>
        <ul>
          <li>Making the foreground and background colors too close in contrast, which many scanners can't read reliably.</li>
          <li>Setting a transparent background and then placing the code over a busy image - same underlying contrast problem.</li>
          <li>Generating a WiFi code with the wrong security type selected, which produces a code that fails to connect.</li>
          <li>Printing a code too small for its content - dense payloads (long URLs, full vCards) need more modules and don't shrink well.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Why won't my QR code scan?</h3>
          <p>
            Usually low contrast, too small a print size for the amount of data encoded, or too
            tight a margin. Try a higher error correction level and make sure the quiet zone
            (margin) around the code isn't cropped off.
          </p>
        </div>
        <div className="faq-item">
          <h3>Can I put a logo in the middle of my QR code?</h3>
          <p>
            This tool doesn't overlay a logo, but if you add one yourself afterward, use the{' '}
            <strong>H</strong> error correction level first - it tolerates the most obscured area
            before becoming unreadable.
          </p>
        </div>
        <div className="faq-item">
          <h3>Do QR codes expire?</h3>
          <p>
            No - a static QR code (like the ones generated here) encodes its data permanently and
            works for as long as the destination (e.g. a URL) still exists. It's dynamic QR
            services, not the codes themselves, that can "expire" if that service shuts down.
          </p>
        </div>
        <div className="faq-item">
          <h3>Will the WiFi QR code share my password with anyone who scans it?</h3>
          <p>
            Yes - anyone who scans it can join the network (and technically read the password
            back out of the code), so treat a printed WiFi QR code the way you'd treat writing the
            password on a sticky note.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my data uploaded anywhere to generate the code?</h3>
          <p>No - the QR image is generated entirely in your browser; nothing is sent to a server.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Browse the rest of the <Link to="/category/graphics-media">Graphics &amp; Media tools</Link> on
          Rootconverter.
        </p>
      </article>
    </div>
  );
}
