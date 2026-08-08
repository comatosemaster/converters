import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { usePasteToUpload } from '../../hooks/usePasteToUpload.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

// A handful of common languages, plus Georgian as specifically requested.
// These are tesseract's own language codes - the matching "traineddata"
// file (the language model) is fetched the first time each one is used.
const LANGUAGES = [
  { code: 'eng', name: 'English' },
  { code: 'kat', name: 'Georgian' },
  { code: 'rus', name: 'Russian' },
  { code: 'fra', name: 'French' },
  { code: 'deu', name: 'German' },
  { code: 'spa', name: 'Spanish' },
];

// Turns tesseract's raw status strings ("loading tesseract core") into
// something a bit more sentence-like for display.
function formatStatus(status) {
  if (!status) return 'Working…';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function confidenceLevel(confidence) {
  if (confidence >= 80) return 'high';
  if (confidence >= 50) return 'medium';
  return 'low';
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function ImageToText() {
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  // A pasted image, held here while we wait for the discard confirmation
  // above - null means "just resetting", not "resetting to load a file".
  const [pendingFile, setPendingFile] = useState(null);

  const [lang, setLang] = useState('eng');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [error, setError] = useState('');

  const [resultText, setResultText] = useState('');
  const [confidence, setConfidence] = useState(null);
  const [resultBlobUrl, setResultBlobUrl] = useState('');
  const [copied, setCopied] = useState(false);
  // Remembers the exact result text at the moment it was last copied or
  // downloaded, so we can tell "already saved this" apart from "there's a
  // newer result since then" (e.g. after re-running with a new language).
  const [savedText, setSavedText] = useState(null);

  // Turn the chosen File into an object URL we can point <img> at, for a
  // small preview of what's about to be OCR'd.
  useEffect(() => {
    if (!file) {
      setSourceUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Turns the extracted text into a downloadable .txt file. Re-runs
  // whenever a new OCR result comes in.
  useEffect(() => {
    if (!resultText) {
      setResultBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      return;
    }
    const blob = new Blob([resultText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    setResultBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [resultText]);

  function handleFile(selectedFile) {
    if (!selectedFile) return;
    if (!selectedFile.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setFile(selectedFile);
    setResultText('');
    setConfidence(null);
  }

  function handleReset() {
    setFile(null);
    setResultText('');
    setConfidence(null);
    setError('');
  }

  // "Choose a different image" and pasting a new image both throw away the
  // current result - if there's unsaved work, confirm first instead of
  // silently discarding it. (Neither of these navigates anywhere, so
  // UnsavedChangesGuard can't catch them on its own - it only watches for
  // page-to-page navigation.) `pendingFile` remembers a pasted image while
  // we wait for the user to confirm, so we can load it after they do.
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

  async function handleExtractText() {
    if (!file) return;

    setIsProcessing(true);
    setError('');
    setResultText('');
    setConfidence(null);
    setProgressStatus('Starting…');
    setProgressPercent(0);

    let worker;
    try {
      // tesseract.js is dynamically imported so its code isn't part of the
      // main site bundle for tools that never run OCR - only someone who
      // actually uses this tool downloads it.
      const { createWorker } = await import('tesseract.js');

      worker = await createWorker(lang, undefined, {
        // Self-hosted (see public/tesseract/) so the OCR engine itself
        // loads from our own site instead of a third-party CDN. Only the
        // per-language training data below still comes from tesseract.js's
        // own CDN - vendoring every language's multi-megabyte data file
        // isn't practical, and that CDN is what the library itself
        // documents and relies on.
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract/tesseract-core-simd-lstm.wasm.js',
        logger: (message) => {
          if (message.status) setProgressStatus(message.status);
          if (typeof message.progress === 'number') {
            setProgressPercent(Math.round(message.progress * 100));
          }
        },
      });

      const { data } = await worker.recognize(file);
      setResultText(data.text.trim());
      setConfidence(Math.round(data.confidence));
    } catch {
      setError(
        "Something went wrong running OCR on this image. Try a clearer image, or a different language.",
      );
    } finally {
      // Always terminate - the worker holds a large WASM instance in
      // memory that won't be freed until we do.
      if (worker) await worker.terminate();
      setIsProcessing(false);
    }
  }

  async function handleCopy() {
    if (!resultText) return;
    await navigator.clipboard.writeText(resultText);
    setCopied(true);
    setSavedText(resultText);
    setTimeout(() => setCopied(false), 1500);
  }

  const hasUnsavedWork = resultText.length > 0 && resultText !== savedText;
  useUnsavedChangesWarning(hasUnsavedWork);
  // Always listening (not just while the drop zone is empty) - pasting a
  // new image over an existing one is allowed, it just goes through the
  // same discard confirmation as "Choose a different image" when needed.
  usePasteToUpload(true, handlePastedFile);

  return (
    <div className="image-to-text">
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
          <p className="drop-zone-hint">Works best on clear, printed text</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
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
                  ? "You have an extracted result that hasn't been copied or downloaded. Pasting a new image will discard it."
                  : "You have an extracted result that hasn't been copied or downloaded. Choosing a different image will discard it."
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

          <p className="field-hint">
            Works best on clear, printed text. Accuracy drops on handwriting, skewed photos,
            low-resolution images, or multi-column layouts.
          </p>

          <div className="comparison-image-frame ocr-preview-frame">
            {sourceUrl && <img src={sourceUrl} alt="" className="comparison-image" />}
          </div>

          <div className="field">
            <label htmlFor="ocr-lang">Language</label>
            <select id="ocr-lang" value={lang} onChange={(event) => setLang(event.target.value)}>
              {LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.name}
                </option>
              ))}
            </select>
            <p className="field-hint">
              First use of a language downloads its OCR data (several MB) - it's cached in your
              browser after that.
            </p>
          </div>

          <button
            type="button"
            className="download-button"
            onClick={handleExtractText}
            disabled={isProcessing}
          >
            {isProcessing ? 'Extracting…' : 'Extract Text'}
          </button>

          {isProcessing && (
            <div className="field">
              <p className="field-hint">
                {formatStatus(progressStatus)} {progressPercent}%
              </p>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}

          {error && <p className="field-error">{error}</p>}

          {resultText && (
            <div className="field">
              <div className="field-header">
                <label htmlFor="ocr-result">
                  Extracted text
                  {confidence !== null && (
                    <span className={`confidence-badge confidence-${confidenceLevel(confidence)}`}>
                      {confidence}% confidence
                    </span>
                  )}
                </label>
                <button type="button" className="copy-button" onClick={handleCopy}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <textarea id="ocr-result" rows={10} value={resultText} readOnly />
              <a
                className="download-button"
                href={resultBlobUrl}
                download="extracted-text.txt"
                onClick={() => setSavedText(resultText)}
              >
                Download as .txt
              </a>
            </div>
          )}
        </>
      )}

      <article className="tool-article">
        <p>
          OCR (optical character recognition) reads the text visible in an image and turns it
          into real, selectable, copyable text. This tool runs a full OCR engine inside your
          browser via WebAssembly, so screenshots and photos never have to leave your device to
          be transcribed.
        </p>

        <h2>How it works</h2>
        <p>
          Tesseract, an open-source OCR engine, is loaded as WebAssembly and run in a background
          Web Worker so the page stays responsive. It analyzes the image's pixels to identify
          letterforms and reconstructs them as text, along with a confidence score estimating how
          sure it is about the result.
        </p>

        <h2>Getting the best accuracy</h2>
        <ul>
          <li>Use a clear, high-resolution image - blurry or tiny text is much harder to recognize correctly.</li>
          <li>Straight-on, unskewed photos work far better than angled ones.</li>
          <li>Printed text is much more reliable than handwriting, which OCR still struggles with generally.</li>
          <li>Simple single-column layouts recognize more accurately than complex multi-column ones.</li>
        </ul>

        <h2>When to use it - and when not to</h2>
        <p>
          Great for pulling text out of screenshots, scanned documents, or photos of signs and
          printed pages. Less reliable for handwriting, stylized fonts, low-resolution images, or
          heavily skewed photos - for those, expect to manually correct some of the output.
        </p>

        <h2>Common mistakes</h2>
        <ul>
          <li>Expecting perfect accuracy on a low-quality or heavily compressed image - OCR accuracy tracks image quality closely.</li>
          <li>Picking the wrong language before running - recognition is tuned per language, so a mismatch produces garbled results even on clear text.</li>
          <li>Not checking the confidence score - a low score is a signal to double-check the output rather than trust it blindly.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Why is the extracted text full of errors?</h3>
          <p>Usually image quality, skew, or an unusual font - try a clearer, straighter photo, or confirm the right language is selected.</p>
        </div>
        <div className="faq-item">
          <h3>Does this work on handwriting?</h3>
          <p>It can, but much less reliably than printed text - handwriting recognition is a genuinely harder problem for OCR engines in general.</p>
        </div>
        <div className="faq-item">
          <h3>What does the confidence percentage mean?</h3>
          <p>It's the OCR engine's own estimate of how sure it is about the result - lower numbers mean it's worth proofreading the output more carefully.</p>
        </div>
        <div className="faq-item">
          <h3>Why did the first run take so long?</h3>
          <p>The OCR engine and language data (several MB) download on first use and are cached afterward - later runs with the same language are noticeably faster.</p>
        </div>
        <div className="faq-item">
          <h3>Is my image uploaded anywhere?</h3>
          <p>No - recognition runs entirely in your browser. Only the OCR engine/language files themselves are fetched from tesseract.js's own hosting, not your image.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Browse the rest of the <Link to="/category/text-data">Text &amp; Data tools</Link> on
          Rootconverter.
        </p>
      </article>
    </div>
  );
}
