import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { usePasteToUpload } from '../../hooks/usePasteToUpload.js';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';
import {
  validateImage,
  readImage,
  readImageDimensions,
  imageToBase64,
  calculateBase64Size,
} from './imageToBase64Utils.js';

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> — the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// The actual encoding/validation logic lives in imageToBase64Utils.js —
// this file is just the UI wired up to it.

export default function ImageToBase64() {
  const fileInputRef = useRef(null);
  const base64TextareaRef = useRef(null);
  const dataUriTextareaRef = useRef(null);

  const [file, setFile] = useState(null);
  const [dataUri, setDataUri] = useState(''); // "data:image/png;base64,AAAA..."
  const [dimensions, setDimensions] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  // A pasted image, held here while we wait for the discard confirmation
  // above — null means "just resetting", not "resetting to load a file".
  const [pendingFile, setPendingFile] = useState(null);

  const [copiedBase64, setCopiedBase64] = useState(false);
  const [copiedDataUri, setCopiedDataUri] = useState(false);
  const [base64BlobUrl, setBase64BlobUrl] = useState('');
  const [dataUriBlobUrl, setDataUriBlobUrl] = useState('');

  useDocumentMeta({
    title: 'Image to Base64 Converter — Free & Client-Side | Toolbox',
    description:
      'Convert PNG, JPG, WebP, GIF, BMP, or SVG images to Base64 or a Data URI entirely in your browser. No upload, no backend.',
  });

  // Builds downloadable .txt files for both outputs whenever the image
  // changes. It's plain text, so this is cheap enough to just rebuild from
  // scratch rather than caching anything cleverer.
  useEffect(() => {
    if (!dataUri) {
      setBase64BlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      setDataUriBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      return;
    }

    const base64Url = URL.createObjectURL(
      new Blob([imageToBase64(dataUri)], { type: 'text/plain' }),
    );
    const dataUriUrl = URL.createObjectURL(new Blob([dataUri], { type: 'text/plain' }));
    setBase64BlobUrl(base64Url);
    setDataUriBlobUrl(dataUriUrl);

    return () => {
      URL.revokeObjectURL(base64Url);
      URL.revokeObjectURL(dataUriUrl);
    };
  }, [dataUri]);

  async function handleFile(selectedFile) {
    const validation = validateImage(selectedFile);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setError('');
    setIsProcessing(true);

    try {
      // FileReader does the actual Base64 encoding for us (see
      // imageToBase64Utils.js) — we just read the result.
      const uri = await readImage(selectedFile);
      // Decoding it as an <img> both confirms it's a real, readable image
      // (catching corrupted files) and gives us its pixel dimensions.
      const dims = await readImageDimensions(uri);
      setFile(selectedFile);
      setDataUri(uri);
      setDimensions(dims);
    } catch {
      setError("This file couldn't be read as a valid image — it may be corrupted.");
    } finally {
      setIsProcessing(false);
    }
  }

  function handleReset() {
    setFile(null);
    setDataUri('');
    setDimensions(null);
    setError('');
  }

  // "Choose a different image" and pasting a new image both throw away the
  // current result — if there's unsaved work, confirm first instead of
  // silently discarding it. (Neither of these navigates anywhere, so
  // UnsavedChangesGuard can't catch them on its own — it only watches for
  // page-to-page navigation.)
  function handleChooseAnotherClick() {
    if (hasUnsavedWork) {
      setPendingFile(null);
      setShowResetConfirm(true);
    } else {
      handleReset();
    }
  }

  function handlePastedFile(newFile) {
    if (hasUnsavedWork) {
      setPendingFile(newFile);
      setShowResetConfirm(true);
    } else {
      handleFile(newFile);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files[0]);
  }

  async function handleCopyBase64() {
    if (!base64) return;
    await navigator.clipboard.writeText(base64);
    setCopiedBase64(true);
    setTimeout(() => setCopiedBase64(false), 1500);
  }

  async function handleCopyDataUri() {
    if (!dataUri) return;
    await navigator.clipboard.writeText(dataUri);
    setCopiedDataUri(true);
    setTimeout(() => setCopiedDataUri(false), 1500);
  }

  // Always listening (not just while the drop zone is empty) — pasting a
  // new image over an existing one is allowed, it just goes through the
  // same discard confirmation as "Choose a different image" when needed.
  usePasteToUpload(true, handlePastedFile);

  // A file loaded here counts as unsaved work for as long as it's loaded.
  // Per this tool's spec, copying or downloading the output does NOT clear
  // the flag (unlike the other image tools' "download = saved" pattern) —
  // only Clear does, so there's nothing extra to track beyond "is a file
  // loaded right now."
  const hasUnsavedWork = Boolean(file);
  useUnsavedChangesWarning(hasUnsavedWork);

  const base64 = dataUri ? imageToBase64(dataUri) : '';
  const base64Size = file ? calculateBase64Size(file.size) : 0;
  const sizeIncreasePercent =
    file && file.size > 0 ? Math.round(((base64Size - file.size) / file.size) * 100) : 0;

  return (
    <div className="image-to-base64">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      {!file ? (
        <div
          className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <p className="drop-zone-title">Drag &amp; drop, paste, or click to browse</p>
          <p className="drop-zone-hint">PNG, JPG, WebP, GIF, BMP, or SVG</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml"
            className="visually-hidden"
            onChange={(event) => handleFile(event.target.files[0])}
          />
        </div>
      ) : (
        <>
          <div className="converter-toolbar">
            <button type="button" className="ghost-button" onClick={handleChooseAnotherClick}>
              &larr; Choose a different image
            </button>
          </div>

          {showResetConfirm && (
            <ConfirmDialog
              title="Discard this result?"
              message={
                pendingFile
                  ? 'You have a generated Base64 result. Pasting a new image will discard it.'
                  : 'You have a generated Base64 result. Choosing a different image will discard it.'
              }
              confirmLabel={pendingFile ? 'Discard and load pasted image' : 'Discard and choose another'}
              onCancel={() => {
                setShowResetConfirm(false);
                setPendingFile(null);
              }}
              onConfirm={() => {
                setShowResetConfirm(false);
                if (pendingFile) {
                  handleFile(pendingFile);
                  setPendingFile(null);
                } else {
                  handleReset();
                }
              }}
            />
          )}

          {error && <p className="field-error">{error}</p>}

          {isProcessing ? (
            <p className="category-empty">Reading image…</p>
          ) : (
            <>
              <div className="comparison">
                <div className="comparison-panel">
                  <h3>Preview</h3>
                  <div className="comparison-image-frame">
                    {dataUri && <img src={dataUri} alt="" className="comparison-image" />}
                  </div>
                  <dl className="comparison-meta">
                    <div>
                      <dt>File name</dt>
                      <dd>{file.name}</dd>
                    </div>
                    <div>
                      <dt>File type</dt>
                      <dd>{file.type || 'unknown'}</dd>
                    </div>
                    <div>
                      <dt>File size</dt>
                      <dd>{formatBytes(file.size)}</dd>
                    </div>
                    {dimensions && (
                      <div>
                        <dt>Dimensions</dt>
                        <dd>
                          {dimensions.width}&times;{dimensions.height}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Estimated Base64 size</dt>
                      <dd>{formatBytes(base64Size)} (+{sizeIncreasePercent}%)</dd>
                    </div>
                  </dl>
                </div>

                <div className="comparison-panel">
                  <h3>Base64</h3>
                  <div className="field-header">
                    <span className="field-hint">{base64.length.toLocaleString()} characters</span>
                    <div>
                      <button
                        type="button"
                        className="copy-button"
                        onClick={() => base64TextareaRef.current?.select()}
                      >
                        Select All
                      </button>{' '}
                      <button type="button" className="copy-button" onClick={handleCopyBase64}>
                        {copiedBase64 ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                  <textarea ref={base64TextareaRef} rows={8} value={base64} readOnly />
                  <a className="download-button" href={base64BlobUrl} download="image-base64.txt">
                    Download Base64 as .txt
                  </a>
                </div>
              </div>

              <div className="field">
                <div className="field-header">
                  <label htmlFor="data-uri-output">Data URI</label>
                  <div>
                    <button
                      type="button"
                      className="copy-button"
                      onClick={() => dataUriTextareaRef.current?.select()}
                    >
                      Select All
                    </button>{' '}
                    <button type="button" className="copy-button" onClick={handleCopyDataUri}>
                      {copiedDataUri ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                <textarea
                  id="data-uri-output"
                  ref={dataUriTextareaRef}
                  rows={4}
                  value={dataUri}
                  readOnly
                />
                <a className="download-button" href={dataUriBlobUrl} download="image-data-uri.txt">
                  Download Data URI as .txt
                </a>
              </div>
            </>
          )}
        </>
      )}

      <article className="tool-article">
        <p>
          Base64 turns an image's raw bytes into plain text, so it can be pasted directly into
          HTML, CSS, JavaScript, JSON, or an API request without a separate file. This tool
          converts any image entirely in your browser and gives you both the raw Base64 string
          and a ready-to-use Data URI.
        </p>

        <h2>How Base64 encoding works</h2>
        <p>
          Base64 represents binary data using only 64 printable characters (A–Z, a–z, 0–9,{' '}
          <code>+</code>, <code>/</code>), so it can travel safely through text-only channels.
          Every 3 bytes of the original file become 4 Base64 characters — which is why the
          encoded output is roughly a third larger than the source file. Your browser's{' '}
          <code>FileReader</code> API does this encoding directly; nothing is uploaded to do it.
        </p>

        <h2>Base64 vs Data URI</h2>
        <p>
          The raw Base64 string is just the encoded characters. A Data URI wraps that in a{' '}
          <code>data:&lt;mime-type&gt;;base64,&lt;data&gt;</code> prefix, which tells a browser
          (or anything else that understands the scheme) exactly how to interpret it — paste a
          Data URI straight into <code>&lt;img src="..."&gt;</code> or a CSS{' '}
          <code>background-image: url(...)</code> and it renders with no separate file needed.
        </p>

        <h2>Advantages and disadvantages</h2>
        <ul>
          <li>
            <strong>Advantages:</strong> no extra network request, the image travels with the
            document/code that uses it, and it works well for small inline icons.
          </li>
          <li>
            <strong>Disadvantages:</strong> about 33% larger than the original file, can't be
            cached separately from the page that embeds it, and bloats HTML/CSS/JS if overused —
            not a good fit for large photos.
          </li>
        </ul>

        <h2>Common use cases</h2>
        <ul>
          <li>Inlining small icons or logos in CSS/HTML to avoid an extra HTTP request.</li>
          <li>Embedding images directly in JSON API responses.</li>
          <li>Storing small images in a database text field.</li>
          <li>HTML emails, where some clients block external images but allow inline data.</li>
        </ul>

        <h2>Performance considerations</h2>
        <p>
          The ~33% size increase and loss of independent caching both matter more as the image
          gets bigger — Base64 is generally best reserved for small icons and thumbnails, not
          full-size photos, which are usually better served as ordinary linked files.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Why is my Base64 string so much longer than the original file?</h3>
          <p>
            Base64 encodes every 3 bytes as 4 characters, so it's inherently about 33% larger
            than the source — that's the tradeoff for representing binary data as plain text.
          </p>
        </div>
        <div className="faq-item">
          <h3>What's the difference between the Base64 output and the Data URI?</h3>
          <p>
            The Base64 output is just the raw encoded characters. The Data URI wraps that in a{' '}
            <code>data:image/...;base64,</code> prefix — that's the one you'd actually paste into
            an <code>&lt;img src&gt;</code> or CSS <code>url()</code>.
          </p>
        </div>
        <div className="faq-item">
          <h3>Can I use this for large images?</h3>
          <p>
            Technically yes, but it's usually not a good idea — Base64-encoded images can't be
            cached separately and bloat whatever file they're embedded in. It's best suited for
            small icons and thumbnails.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my image uploaded anywhere?</h3>
          <p>
            No. Everything happens in your browser using the FileReader API — your image is
            never sent anywhere.
          </p>
        </div>
        <div className="faq-item">
          <h3>Does this work with SVG files?</h3>
          <p>Yes — SVGs convert to Base64 just like any other supported image format.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Browse the rest of the{' '}
          <Link to="/category/graphics-media">Graphics &amp; Media tools</Link> on Toolbox.
        </p>
      </article>
    </div>
  );
}
