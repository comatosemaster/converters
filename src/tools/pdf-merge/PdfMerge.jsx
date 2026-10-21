import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';
import { closePdf, openPdf, pageSize, renderPage } from '../../utils/pdfjs.js';
import { mergePdfs, parsePageRange, readPdf, reorder, validatePdfFile } from './pdfMergeUtils.js';

let nextId = 1;

// A small picture of page 1, so files in the list are recognisable at a
// glance. Purely cosmetic - if pdf.js can't draw it, the list just shows
// no thumbnail.
async function makeThumbnail(bytes) {
  try {
    const pdf = await openPdf(bytes);
    const { width } = await pageSize(pdf, 1);
    const canvas = await renderPage(pdf, 1, 96 / width);
    closePdf(pdf);
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function PdfMerge() {
  const fileInputRef = useRef(null);

  // { id, file, bytes, pageCount, range, thumbnail }
  const [items, setItems] = useState([]);
  const [isDragging, setIsDragging] = useState(false); // drop zone drag-over state
  const [dragItemIndex, setDragItemIndex] = useState(null); // list-reorder drag state
  const [dragOverItemIndex, setDragOverItemIndex] = useState(null);
  const [isReading, setIsReading] = useState(false);
  const [fileErrors, setFileErrors] = useState([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const [isMerging, setIsMerging] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total }
  const [mergeError, setMergeError] = useState('');
  const [result, setResult] = useState(null); // { blob, url, pageCount }
  const [downloaded, setDownloaded] = useState(false);

  // Any change to the list or page ranges makes the last merged file stale -
  // clear it rather than let the download button serve something that no
  // longer matches what's on screen.
  useEffect(() => {
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setDownloaded(false);
  }, [items]);

  // Release the merged file's memory when leaving the page.
  const resultRef = useRef(result);
  useEffect(() => {
    resultRef.current = result;
  }, [result]);
  useEffect(() => () => resultRef.current && URL.revokeObjectURL(resultRef.current.url), []);

  async function handleFiles(fileList) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    setIsReading(true);
    const errors = [];
    const added = [];
    for (const file of files) {
      const validation = validatePdfFile(file);
      if (!validation.ok) {
        errors.push(`${file.name}: ${validation.error}`);
        continue;
      }
      try {
        const { bytes, pageCount } = await readPdf(file);
        added.push({ id: nextId++, file, bytes, pageCount, range: '', thumbnail: '' });
      } catch (error) {
        errors.push(`${file.name}: ${error.message}`);
      }
    }
    setItems((prev) => [...prev, ...added]);
    setFileErrors(errors);
    setIsReading(false);

    // Thumbnails arrive afterwards, so the list appears immediately.
    for (const item of added) {
      const thumbnail = await makeThumbnail(item.bytes);
      if (thumbnail) {
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, thumbnail } : it)));
      }
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  }

  function handleRemove(id) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function handleRangeChange(id, range) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, range } : item)));
  }

  // --- Drag-and-drop reordering ---------------------------------------------
  // Native HTML5 drag-and-drop between list items. The arrow buttons cover
  // the same action for keyboard and screen-reader users, since native
  // drag-and-drop has no keyboard equivalent.

  function handleItemDrop(index) {
    if (dragItemIndex !== null) setItems((prev) => reorder(prev, dragItemIndex, index));
    setDragItemIndex(null);
    setDragOverItemIndex(null);
  }

  function doClear() {
    setItems([]);
    setFileErrors([]);
    setMergeError('');
  }

  function handleClearClick() {
    if (hasUnsavedWork) setShowClearConfirm(true);
    else doClear();
  }

  // Each file's typed page range, parsed - recomputed on every render so
  // mistakes show up while typing, not only when Merge is clicked.
  const parsed = items.map((item) => parsePageRange(item.range, item.pageCount));
  const rangeErrors = parsed.some((p) => !p.ok);
  const totalPages = parsed.reduce((sum, p) => sum + (p.ok ? p.pages.length : 0), 0);

  async function handleMerge() {
    if (rangeErrors || items.length === 0) return;
    setIsMerging(true);
    setMergeError('');
    setProgress({ done: 0, total: items.length });
    try {
      const blob = await mergePdfs(
        items.map((item, i) => ({ bytes: item.bytes, pages: parsed[i].pages })),
        (done, total) => setProgress({ done, total }),
      );
      setResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { blob, url: URL.createObjectURL(blob), pageCount: totalPages };
      });
      setDownloaded(false);
    } catch {
      setMergeError('Something went wrong merging these PDFs. One of them may be damaged - try removing files one at a time to find it.');
    } finally {
      setIsMerging(false);
      setProgress(null);
    }
  }

  const hasUnsavedWork = items.length > 0 && !downloaded;
  useUnsavedChangesWarning(hasUnsavedWork);

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="application/pdf,.pdf"
      multiple
      className="visually-hidden"
      aria-label="Choose PDF files"
      onChange={(event) => {
        handleFiles(event.target.files);
        event.target.value = '';
      }}
    />
  );

  return (
    <div className="pdf-merge">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      {showClearConfirm && (
        <ConfirmDialog
          title="Remove all PDFs?"
          message="You haven't downloaded a merged file yet. Clearing removes every PDF from the list."
          confirmLabel="Discard and clear"
          onCancel={() => setShowClearConfirm(false)}
          onConfirm={() => {
            setShowClearConfirm(false);
            doClear();
          }}
        />
      )}

      {items.length === 0 ? (
        <div
          className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
          role="button"
          tabIndex={0}
          aria-label="Drag and drop, or click to choose PDF files to merge"
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
          <p className="drop-zone-title">
            {isReading ? 'Reading PDFs…' : 'Drag & drop, or click to browse'}
          </p>
          <p className="drop-zone-hint">Choose two or more PDF files to combine into one</p>
          {fileInput}
        </div>
      ) : (
        <>
          <div className="converter-toolbar">
            <button
              type="button"
              className="ghost-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isReading}
            >
              {isReading ? 'Reading…' : '+ Add more PDFs'}
            </button>
            {fileInput}
          </div>
        </>
      )}

      {fileErrors.length > 0 && (
        <div className="field-error">
          {fileErrors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <>
          <h2 className="pdf-section-heading">
            Files ({items.length}) &mdash; drag to reorder, or use the arrow buttons
          </h2>
          <ul className="pdf-image-list" aria-label="PDFs in merge order">
            {items.map((item, index) => (
              <li
                key={item.id}
                className={dragOverItemIndex === index ? 'pdf-image-item drag-over' : 'pdf-image-item'}
                draggable
                onDragStart={() => setDragItemIndex(index)}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverItemIndex(index);
                }}
                onDrop={() => handleItemDrop(index)}
                onDragEnd={() => {
                  setDragItemIndex(null);
                  setDragOverItemIndex(null);
                }}
              >
                <span className="pdf-image-position" aria-hidden="true">
                  {index + 1}
                </span>
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" className="pdf-image-thumb pdf-merge-thumb" />
                ) : (
                  <span className="pdf-image-thumb pdf-merge-thumb" aria-hidden="true" />
                )}
                <div className="pdf-image-info">
                  <p className="pdf-image-name">{item.file.name}</p>
                  <p className="pdf-image-meta">
                    {item.pageCount} page{item.pageCount === 1 ? '' : 's'} &middot; {formatBytes(item.file.size)}
                  </p>
                  <input
                    type="text"
                    className="pdf-merge-range"
                    value={item.range}
                    placeholder="All pages (or e.g. 1-3, 5)"
                    aria-label={`Pages to include from ${item.file.name}`}
                    aria-invalid={!parsed[index].ok}
                    onChange={(event) => handleRangeChange(item.id, event.target.value)}
                    // Typing in the field shouldn't start a list-reorder drag.
                    draggable
                    onDragStart={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  />
                  {!parsed[index].ok && <p className="field-error">{parsed[index].error}</p>}
                </div>
                <div className="pdf-image-actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setItems((prev) => reorder(prev, index, index - 1))}
                    disabled={index === 0}
                    aria-label={`Move ${item.file.name} up`}
                  >
                    &uarr;
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setItems((prev) => reorder(prev, index, index + 1))}
                    disabled={index === items.length - 1}
                    aria-label={`Move ${item.file.name} down`}
                  >
                    &darr;
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => handleRemove(item.id)}
                    aria-label={`Remove ${item.file.name}`}
                  >
                    &times;
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <dl className="comparison-meta pdf-summary">
            <div>
              <dt>Files</dt>
              <dd>{items.length}</dd>
            </div>
            <div>
              <dt>Pages in merged PDF</dt>
              <dd>{rangeErrors ? '—' : totalPages}</dd>
            </div>
          </dl>

          {items.length === 1 && (
            <p className="field-hint">
              Add at least one more PDF to merge - or use the page box above to pull out just some
              pages of this one.
            </p>
          )}
          {mergeError && <p className="field-error">{mergeError}</p>}

          <div className="converter-toolbar">
            {result ? (
              <a
                className="download-button"
                href={result.url}
                download="merged.pdf"
                onClick={() => setDownloaded(true)}
              >
                Download merged PDF ({formatBytes(result.blob.size)})
              </a>
            ) : (
              <button
                type="button"
                className="download-button"
                onClick={handleMerge}
                disabled={isMerging || isReading || rangeErrors}
              >
                {isMerging && progress
                  ? `Merging… (${progress.done}/${progress.total})`
                  : items.length === 1
                    ? 'Extract pages'
                    : 'Merge PDFs'}
              </button>
            )}
            <button type="button" className="ghost-button" onClick={handleClearClick}>
              Clear all
            </button>
          </div>
        </>
      )}

      <article className="tool-article">
        <p>
          Merging PDFs combines several documents into one file, in the order you choose. This
          tool does it entirely in your browser: your files are never uploaded, so contracts,
          bank statements and other private documents stay on your device.
        </p>

        <h2>How to merge PDF files</h2>
        <ol>
          <li>Drop your PDFs into the box above, or click to choose them. You can add more at any time.</li>
          <li>Drag the files into the order you want, or use the arrow buttons.</li>
          <li>Optionally, type which pages to keep from each file - for example <code>1-3, 5</code>.</li>
          <li>Click <strong>Merge PDFs</strong>, then download the combined file.</li>
        </ol>

        <h2>Choosing pages</h2>
        <p>
          Leave a file&apos;s page box empty to include every page. Otherwise list pages and ranges
          separated by commas: <code>2</code> takes one page, <code>4-7</code> a range,{' '}
          <code>9-</code> everything from page 9 to the end, and a backwards range like{' '}
          <code>5-1</code> adds those pages in reverse order. Pages appear in the merged PDF in
          the order you type them, so this also works for reordering or removing pages from a
          single PDF.
        </p>

        <h2>How it works</h2>
        <p>
          The pages are copied from each PDF into a new document exactly as they are, using the
          open-source pdf-lib library. Nothing is converted to images or re-compressed, so text
          stays selectable and searchable, vector graphics stay sharp, and the merged file is
          about the size of the originals put together.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Are my PDFs uploaded to a server?</h3>
          <p>No - everything happens in your browser. The files never leave your device, which you can confirm by disconnecting from the internet after the page loads: merging still works.</p>
        </div>
        <div className="faq-item">
          <h3>Is there a limit on files or pages?</h3>
          <p>There&apos;s no fixed limit on the number of files or pages. Each file can be up to 100 MB; very large merges are limited only by your device&apos;s memory.</p>
        </div>
        <div className="faq-item">
          <h3>Can I merge password-protected PDFs?</h3>
          <p>Not yet - encrypted PDFs can&apos;t be read without removing the protection first. The tool tells you which file is protected so you can deal with just that one.</p>
        </div>
        <div className="faq-item">
          <h3>Will merging reduce the quality?</h3>
          <p>No. Pages are copied without any re-rendering or compression, so the merged document looks exactly like the originals.</p>
        </div>
        <div className="faq-item">
          <h3>Do links and bookmarks survive?</h3>
          <p>Page content - text, images, drawings and most links on the page - is kept. Document-level extras such as the bookmark outline and form fields that span files may not carry over.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Turn PDF pages into pictures with <Link to="/tool/pdf-to-image">PDF to Image</Link>,
          build a PDF from photos with <Link to="/tool/image-to-pdf">Image to PDF</Link>, or browse
          the rest of the <Link to="/category/text-data">Text &amp; Data tools</Link> on NeatSize.
        </p>
      </article>
    </div>
  );
}
