import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';
import { closePdf, openPdf } from '../../utils/pdfjs.js';
import { parsePageRange } from '../pdf-merge/pdfMergeUtils.js';
import {
  FORMATS,
  RESOLUTIONS,
  baseName,
  buildZip,
  pageFileName,
  renderPageToBlob,
  validatePdfFile,
} from './pdfToImageUtils.js';

function revokeAll(pages) {
  for (const page of pages) URL.revokeObjectURL(page.url);
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function PdfToImage() {
  const fileInputRef = useRef(null);
  // The open pdf.js document. Kept in a ref: it's a live object with its own
  // worker, not display state.
  const pdfRef = useRef(null);
  // Bumped whenever the file changes, so a conversion still running for
  // the previous file knows to stop.
  const runRef = useRef(0);

  const [file, setFile] = useState(null);
  const [bytes, setBytes] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [isOpening, setIsOpening] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const [format, setFormat] = useState('image/png');
  const [dpi, setDpi] = useState(150);
  const [range, setRange] = useState('');

  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total }
  const [pages, setPages] = useState([]); // { number, blob, url, name, width, height, reduced }
  const [zipUrl, setZipUrl] = useState('');
  const [isZipping, setIsZipping] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState('');

  // Changing any setting makes the rendered images stale - and stops a
  // conversion that's still running with the old settings.
  useEffect(() => {
    runRef.current++;
    setIsConverting(false);
    setProgress(null);
    setPages((prev) => {
      revokeAll(prev);
      return [];
    });
    setZipUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    setDownloaded(false);
  }, [file, format, dpi, range]);

  // Clean up the open document and image URLs when leaving the page.
  const pagesRef = useRef(pages);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  useEffect(
    () => () => {
      revokeAll(pagesRef.current);
      closePdf(pdfRef.current);
    },
    [],
  );

  async function open(fileBytes, pdfPassword) {
    setIsOpening(true);
    setError('');
    try {
      const pdf = await openPdf(fileBytes, pdfPassword);
      closePdf(pdfRef.current);
      pdfRef.current = pdf;
      setPageCount(pdf.numPages);
      setNeedsPassword(false);
      setPassword('');
    } catch (openError) {
      if (openError?.name === 'PasswordException') {
        setNeedsPassword(true);
        if (pdfPassword) setError('That password is incorrect. Please try again.');
      } else {
        setError('This file couldn’t be opened. It may be damaged or not a real PDF.');
      }
    } finally {
      setIsOpening(false);
    }
  }

  async function handleFile(selectedFile) {
    if (!selectedFile) return;
    const validation = validatePdfFile(selectedFile);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    runRef.current++;
    closePdf(pdfRef.current);
    pdfRef.current = null;
    setPageCount(0);
    setNeedsPassword(false);
    setRange('');
    const fileBytes = new Uint8Array(await selectedFile.arrayBuffer());
    setFile(selectedFile);
    setBytes(fileBytes);
    await open(fileBytes);
  }

  function handleReset() {
    runRef.current++;
    closePdf(pdfRef.current);
    pdfRef.current = null;
    setFile(null);
    setBytes(null);
    setPageCount(0);
    setNeedsPassword(false);
    setPassword('');
    setError('');
  }

  function handleResetClick() {
    if (hasUnsavedWork) setShowResetConfirm(true);
    else handleReset();
  }

  const selection = pageCount ? parsePageRange(range, pageCount) : null;

  async function handleConvert() {
    const pdf = pdfRef.current;
    if (!pdf || !selection?.ok) return;
    const run = ++runRef.current;
    setIsConverting(true);
    setError('');
    setPages((prev) => {
      revokeAll(prev);
      return [];
    });
    const numbers = selection.pages.map((index) => index + 1);
    setProgress({ done: 0, total: numbers.length });
    try {
      for (let i = 0; i < numbers.length; i++) {
        const rendered = await renderPageToBlob(pdf, numbers[i], dpi, format);
        if (run !== runRef.current) return; // the file or settings changed meanwhile
        const page = {
          number: numbers[i],
          ...rendered,
          url: URL.createObjectURL(rendered.blob),
          name: pageFileName(file.name, numbers[i], format),
        };
        // Show each page as soon as it's ready rather than all at the end.
        setPages((prev) => [...prev, page]);
        setProgress({ done: i + 1, total: numbers.length });
      }
    } catch {
      if (run === runRef.current) setError('Something went wrong rendering this PDF. Try a lower resolution.');
    } finally {
      if (run === runRef.current) {
        setIsConverting(false);
        setProgress(null);
      }
    }
  }

  async function handleZip() {
    setIsZipping(true);
    try {
      const zip = await buildZip(file.name, pages);
      setZipUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(zip);
      });
    } catch {
      setError('Couldn’t build the ZIP file. Try downloading pages individually.');
    } finally {
      setIsZipping(false);
    }
  }

  const hasUnsavedWork = pages.length > 0 && !downloaded;
  useUnsavedChangesWarning(hasUnsavedWork);
  const finished = pages.length > 0 && !isConverting;
  const anyReduced = pages.some((page) => page.reduced);

  return (
    <div className="pdf-to-image">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      {showResetConfirm && (
        <ConfirmDialog
          title="Discard these images?"
          message="You haven't downloaded the converted images yet. Choosing another PDF will discard them."
          confirmLabel="Discard and choose another"
          onCancel={() => setShowResetConfirm(false)}
          onConfirm={() => {
            setShowResetConfirm(false);
            handleReset();
          }}
        />
      )}

      {!file ? (
        <div
          className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
          role="button"
          tabIndex={0}
          aria-label="Drag and drop, or click to choose a PDF to convert to images"
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
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            handleFile(event.dataTransfer.files[0]);
          }}
        >
          <p className="drop-zone-title">Drag &amp; drop, or click to browse</p>
          <p className="drop-zone-hint">Choose a PDF - every page becomes a PNG, JPG, or WebP image</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="visually-hidden"
            aria-label="Choose a PDF file"
            onChange={(event) => {
              handleFile(event.target.files[0]);
              event.target.value = '';
            }}
          />
        </div>
      ) : (
        <>
          <div className="converter-toolbar">
            <button type="button" className="ghost-button" onClick={handleResetClick}>
              &larr; Choose a different PDF
            </button>
          </div>

          <dl className="comparison-meta pdf-summary">
            <div>
              <dt>File</dt>
              <dd>{file.name}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{formatBytes(file.size)}</dd>
            </div>
            <div>
              <dt>Pages</dt>
              <dd>{pageCount || (isOpening ? '…' : '—')}</dd>
            </div>
          </dl>

          {needsPassword && (
            <form
              className="field"
              onSubmit={(event) => {
                event.preventDefault();
                open(bytes, password);
              }}
            >
              <label htmlFor="pdf-password">This PDF is password-protected</label>
              <div className="pdf-password-row">
                <input
                  id="pdf-password"
                  type="password"
                  value={password}
                  autoComplete="off"
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button type="submit" className="btn btn-primary" disabled={!password || isOpening}>
                  {isOpening ? 'Opening…' : 'Open'}
                </button>
              </div>
              <p className="field-hint">The password is only used in your browser to open the file.</p>
            </form>
          )}

          {pageCount > 0 && (
            <>
              <div className="unit-converter-row">
                <div className="field">
                  <label htmlFor="pdf-image-format">Image format</label>
                  <select id="pdf-image-format" value={format} onChange={(event) => setFormat(event.target.value)}>
                    {FORMATS.map((f) => (
                      <option key={f.mime} value={f.mime}>
                        {f.label} - {f.hint}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="pdf-image-dpi">Resolution</label>
                  <select id="pdf-image-dpi" value={dpi} onChange={(event) => setDpi(Number(event.target.value))}>
                    {RESOLUTIONS.map((r) => (
                      <option key={r.dpi} value={r.dpi}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field">
                <label htmlFor="pdf-image-pages">Pages</label>
                <input
                  id="pdf-image-pages"
                  type="text"
                  value={range}
                  placeholder={`All ${pageCount} pages (or e.g. 1-3, 5)`}
                  aria-invalid={!selection?.ok}
                  onChange={(event) => setRange(event.target.value)}
                />
                {selection && !selection.ok && <p className="field-error">{selection.error}</p>}
              </div>

              <div className="converter-toolbar">
                <button
                  type="button"
                  className="download-button"
                  onClick={handleConvert}
                  disabled={isConverting || !selection?.ok}
                >
                  {isConverting && progress
                    ? `Converting… page ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`
                    : `Convert ${selection?.ok ? selection.pages.length : ''} page${selection?.ok && selection.pages.length === 1 ? '' : 's'} to ${FORMATS.find((f) => f.mime === format).label}`}
                </button>
              </div>
            </>
          )}

          {error && <p className="field-error">{error}</p>}

          {pages.length > 0 && (
            <>
              <h2 className="pdf-section-heading">
                Images ({pages.length}
                {isConverting && progress ? ` of ${progress.total}` : ''})
              </h2>

              {finished && pages.length > 1 && (
                <div className="converter-toolbar">
                  {zipUrl ? (
                    <a
                      className="download-button"
                      href={zipUrl}
                      download={`${baseName(file.name)}-images.zip`}
                      onClick={() => setDownloaded(true)}
                    >
                      Download all as ZIP
                    </a>
                  ) : (
                    <button type="button" className="download-button" onClick={handleZip} disabled={isZipping}>
                      {isZipping ? 'Preparing ZIP…' : `Download all ${pages.length} as ZIP`}
                    </button>
                  )}
                </div>
              )}
              {anyReduced && (
                <p className="field-hint">
                  Some very large pages were rendered at a lower resolution to stay within what a
                  browser can safely handle.
                </p>
              )}

              <ul className="pdf-to-image-grid" aria-label="Converted pages">
                {pages.map((page) => (
                  <li key={page.number} className="pdf-to-image-card">
                    <a href={page.url} download={page.name} onClick={() => setDownloaded(true)}>
                      <img src={page.url} alt={`Page ${page.number}`} className="pdf-to-image-thumb" />
                    </a>
                    <p className="pdf-image-name">Page {page.number}</p>
                    <p className="pdf-image-meta">
                      {page.width}&times;{page.height} &middot; {formatBytes(page.blob.size)}
                    </p>
                    <a
                      className="ghost-button pdf-to-image-download"
                      href={page.url}
                      download={page.name}
                      onClick={() => setDownloaded(true)}
                    >
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <article className="tool-article">
        <p>
          PDF to Image turns the pages of a PDF into ordinary picture files - PNG, JPG, or WebP -
          that you can post, paste into a slide, or attach anywhere a PDF isn&apos;t accepted. The
          conversion runs entirely in your browser, so the document is never uploaded.
        </p>

        <h2>How to convert a PDF to images</h2>
        <ol>
          <li>Drop a PDF into the box above, or click to choose one.</li>
          <li>Pick an image format and resolution.</li>
          <li>Optionally choose which pages to convert, such as <code>1-3, 5</code>.</li>
          <li>Click <strong>Convert</strong>, then download pages one by one or all together as a ZIP.</li>
        </ol>

        <h2>Which format and resolution should I choose?</h2>
        <ul>
          <li><strong>PNG</strong> keeps text and line art perfectly crisp - the best choice for documents, slides and diagrams.</li>
          <li><strong>JPG</strong> makes much smaller files and suits pages that are mostly photos.</li>
          <li><strong>WebP</strong> is usually smaller than both at similar quality, and works in all modern browsers and apps.</li>
          <li><strong>150 DPI</strong> looks sharp on screens and keeps files reasonable. Use <strong>300 DPI</strong> for printing or zooming in on fine print, and <strong>72 DPI</strong> for quick previews.</li>
        </ul>

        <h2>How it works</h2>
        <p>
          The pages are drawn by pdf.js, the same open-source PDF engine Firefox uses to display
          PDFs, onto an in-browser canvas at the resolution you picked, then saved as images. Fonts,
          vector graphics and embedded images are all rendered, including scanned documents and
          Chinese, Japanese and Korean text.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Is my PDF uploaded anywhere?</h3>
          <p>No - the PDF is opened and rendered entirely on your device. Nothing is sent to a server.</p>
        </div>
        <div className="faq-item">
          <h3>Can I convert password-protected PDFs?</h3>
          <p>Yes. If the PDF needs a password to open, you&apos;ll be asked for it. It&apos;s used only inside your browser to unlock the file.</p>
        </div>
        <div className="faq-item">
          <h3>Why is the image file bigger than the PDF?</h3>
          <p>A PDF stores text as compact instructions, while an image stores every pixel. Choose JPG or WebP, or a lower resolution, for smaller files.</p>
        </div>
        <div className="faq-item">
          <h3>Is there a page limit?</h3>
          <p>No fixed limit. Pages are converted one at a time and appear as they finish; very long documents at 300 DPI just take longer and use more memory.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Combine documents with <Link to="/tool/pdf-merge">PDF Merge</Link>, go the other way with{' '}
          <Link to="/tool/image-to-pdf">Image to PDF</Link>, pull the text out of a page image with{' '}
          <Link to="/tool/image-to-text">Image to Text</Link>, or shrink the results with the{' '}
          <Link to="/tool/image-compressor">Image Compressor</Link>.
        </p>
      </article>
    </div>
  );
}
