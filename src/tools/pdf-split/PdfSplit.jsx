import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';
import { closePdf, openPdf, renderPage } from '../../utils/pdfjs.js';
import { parsePageRange, readPdf, validatePdfFile } from '../pdf-merge/pdfMergeUtils.js';
import { MODES, buildParts, compressRanges, planOutput } from './pdfSplitUtils.js';

const THUMB_WIDTH = 150;

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// pdf.js (shared loader in src/utils/pdfjs.js) draws the page thumbnails;
// pdf-lib does the actual splitting (pdfSplitUtils.js). File checks and
// page-range parsing come from the PDF Merge tool.

export default function PdfSplit() {
  const fileInputRef = useRef(null);
  const runRef = useRef(0);
  const lastClickedRef = useRef(null);

  const [doc, setDoc] = useState(null); // { file, bytes, pageCount }
  const [thumbs, setThumbs] = useState([]); // object URLs by page index
  const [mode, setMode] = useState('extract');
  const [selected, setSelected] = useState(() => new Set());
  const [rangeText, setRangeText] = useState('');
  const [rangeError, setRangeError] = useState('');
  const [everyN, setEveryN] = useState(2);
  const [rangesText, setRangesText] = useState('');
  const [error, setError] = useState('');
  const [isOpening, setIsOpening] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(null);
  const [downloaded, setDownloaded] = useState(false);
  const [confirm, setConfirm] = useState(null); // { file } to replace, or 'clear'

  const hasUnsavedWork = Boolean(doc) && !downloaded;
  useUnsavedChangesWarning(hasUnsavedWork);
  useEffect(() => setDownloaded(false), [doc, mode, selected, everyN, rangesText]);

  // Thumbnail URLs are freed when the PDF is closed or replaced, and when
  // leaving the page - not on every update, since each update only adds one.
  const thumbsRef = useRef(thumbs);
  useEffect(() => {
    thumbsRef.current = thumbs;
  }, [thumbs]);
  useEffect(() => () => thumbsRef.current.forEach((url) => url && URL.revokeObjectURL(url)), []);

  function releaseDoc() {
    runRef.current++;
    thumbsRef.current.forEach((url) => url && URL.revokeObjectURL(url));
    thumbsRef.current = [];
    setThumbs([]);
    setDoc(null);
  }

  const plan = useMemo(
    () => (doc ? planOutput(mode, { pageCount: doc.pageCount, selected, everyN, rangesText }) : null),
    [doc, mode, selected, everyN, rangesText],
  );
  // Which output file each page lands in, for the badges on the thumbnails.
  const fileOfPage = useMemo(() => {
    const map = new Map();
    if (plan?.ok && plan.groups.length > 1) plan.groups.forEach((group, i) => group.forEach((p) => !map.has(p) && map.set(p, i + 1)));
    return map;
  }, [plan]);

  async function openFile(file) {
    const check = validatePdfFile(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    const runId = ++runRef.current;
    setIsOpening(true);
    setError('');
    try {
      const { bytes, pageCount } = await readPdf(file);
      if (runId !== runRef.current) return;
      thumbsRef.current.forEach((url) => url && URL.revokeObjectURL(url));
      setDoc({ file, bytes, pageCount });
      setThumbs(new Array(pageCount).fill(''));
      setSelected(new Set());
      setRangeText('');
      setRangesText(pageCount > 1 ? `1-${Math.ceil(pageCount / 2)}, ${Math.ceil(pageCount / 2) + 1}-${pageCount}` : '1');
      setEveryN(Math.min(2, pageCount));
      lastClickedRef.current = null;
      renderThumbnails(bytes, pageCount, runId);
    } catch (openError) {
      setError(openError.message);
    } finally {
      setIsOpening(false);
    }
  }

  // Thumbnails are drawn one after another in the background; the page is
  // usable straight away and fills in as they arrive.
  async function renderThumbnails(bytes, pageCount, runId) {
    let pdf;
    try {
      pdf = await openPdf(bytes);
      for (let i = 0; i < pageCount; i += 1) {
        if (runId !== runRef.current) return;
        const page = await pdf.getPage(i + 1);
        const scale = THUMB_WIDTH / page.getViewport({ scale: 1 }).width;
        const canvas = await renderPage(pdf, i + 1, scale * 1.5);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        if (runId !== runRef.current || !blob) return;
        const url = URL.createObjectURL(blob);
        setThumbs((prev) => {
          const next = [...prev];
          next[i] = url;
          return next;
        });
      }
    } catch {
      // Thumbnails are a convenience - splitting still works without them.
    } finally {
      closePdf(pdf);
    }
  }

  function requestFile(file) {
    if (!file) return;
    if (hasUnsavedWork) setConfirm({ file });
    else openFile(file);
  }

  function applySelection(next) {
    setSelected(next);
    setRangeText(compressRanges([...next]));
    setRangeError('');
  }

  function togglePage(index, shiftKey) {
    const next = new Set(selected);
    if (shiftKey && lastClickedRef.current !== null) {
      // Shift+click selects everything between this page and the last one.
      const [a, b] = [lastClickedRef.current, index].sort((x, y) => x - y);
      for (let i = a; i <= b; i += 1) next.add(i);
    } else if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    lastClickedRef.current = index;
    applySelection(next);
  }

  function handleRangeText(text) {
    setRangeText(text);
    if (!text.trim()) {
      setSelected(new Set());
      setRangeError('');
      return;
    }
    const parsed = parsePageRange(text, doc.pageCount);
    if (parsed.ok) {
      setSelected(new Set(parsed.pages));
      setRangeError('');
    } else {
      setRangeError(parsed.error);
    }
  }

  function quickSelect(kind) {
    const all = Array.from({ length: doc.pageCount }, (_, i) => i);
    const pick = {
      all,
      none: [],
      invert: all.filter((i) => !selected.has(i)),
      odd: all.filter((i) => i % 2 === 0),
      even: all.filter((i) => i % 2 === 1),
    }[kind];
    applySelection(new Set(pick));
  }

  async function handleDownload() {
    if (!plan?.ok) return;
    setError('');
    setBusy({ done: 0, total: plan.groups.length });
    try {
      const base = doc.file.name.replace(/\.pdf$/i, '') || 'document';
      const parts = await buildParts(doc.bytes, plan.groups, { base, mode }, (done, total) => setBusy({ done, total }));
      if (parts.length === 1) {
        downloadBlob(parts[0].blob, parts[0].name);
      } else {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        parts.forEach((part) => zip.file(part.name, part.blob));
        downloadBlob(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), `${base}-split.zip`);
      }
      setDownloaded(true);
    } catch (buildError) {
      setError(buildError.message || 'Something went wrong creating the PDF.');
    } finally {
      setBusy(null);
    }
  }

  const selecting = mode === 'extract' || mode === 'remove';
  const fileCount = plan?.ok ? plan.groups.length : 0;
  const pageTotal = plan?.ok ? plan.groups.reduce((sum, g) => sum + g.length, 0) : 0;
  const currentMode = MODES.find((m) => m.id === mode);

  return (
    <div className="pdf-split">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />
      {confirm && (
        <ConfirmDialog
          title={confirm === 'clear' ? 'Close this PDF?' : 'Open a different PDF?'}
          message="You haven't downloaded the split result yet."
          confirmLabel={confirm === 'clear' ? 'Close PDF' : 'Open PDF'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === 'clear') {
              releaseDoc();
            } else {
              openFile(confirm.file);
            }
            setConfirm(null);
          }}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="visually-hidden"
        aria-label="Choose a PDF"
        onChange={(event) => {
          requestFile(event.target.files[0]);
          event.target.value = '';
        }}
      />

      {!doc && (
        <div
          className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
          role="button"
          tabIndex={0}
          aria-label="Drag and drop or click to choose a PDF"
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
            requestFile(event.dataTransfer.files[0]);
          }}
        >
          <p className="drop-zone-title">{isOpening ? 'Opening…' : 'Drag & drop a PDF, or click to browse'}</p>
          <p className="drop-zone-hint">Pick pages to extract or remove, or split it into several files</p>
        </div>
      )}

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {doc && (
        <>
          <div className="converter-toolbar json-toolbar">
            <span className="field-hint pdf-split-file">
              <strong>{doc.file.name}</strong> · {doc.pageCount} page{doc.pageCount === 1 ? '' : 's'} · {formatBytes(doc.file.size)}
            </span>
            <button type="button" className="ghost-button" onClick={() => fileInputRef.current?.click()}>
              Choose a different PDF
            </button>
            <button type="button" className="ghost-button" onClick={() => (hasUnsavedWork ? setConfirm('clear') : releaseDoc())}>
              Close
            </button>
          </div>

          <div className="mode-toggle" role="radiogroup" aria-label="What to do">
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
          <p className="field-hint pdf-split-mode-hint">{currentMode.hint}</p>

          {selecting && (
            <div className="pdf-split-select">
              <div className="field">
                <label htmlFor="pdf-split-range">
                  Pages to {mode === 'extract' ? 'extract' : 'remove'} - click thumbnails (Shift+click for a run) or type
                </label>
                <input
                  id="pdf-split-range"
                  type="text"
                  value={rangeText}
                  placeholder="e.g. 1-3, 5, 8-"
                  onChange={(event) => handleRangeText(event.target.value)}
                  spellCheck="false"
                  autoComplete="off"
                />
                {rangeError && <p className="field-error">{rangeError}</p>}
              </div>
              <div className="pdf-split-quick" role="group" aria-label="Quick select">
                {[
                  ['all', 'All'],
                  ['none', 'None'],
                  ['invert', 'Invert'],
                  ['odd', 'Odd pages'],
                  ['even', 'Even pages'],
                ].map(([id, label]) => (
                  <button key={id} type="button" className="ghost-button btn-sm" onClick={() => quickSelect(id)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {mode === 'every' && (
            <div className="field pdf-split-every">
              <label htmlFor="pdf-split-every">Pages per file</label>
              <input
                id="pdf-split-every"
                type="number"
                min={1}
                max={doc.pageCount}
                value={everyN}
                onChange={(event) => setEveryN(Math.min(doc.pageCount, Math.max(1, Number(event.target.value) || 1)))}
              />
            </div>
          )}
          {mode === 'ranges' && (
            <div className="field">
              <label htmlFor="pdf-split-ranges">Ranges - each one becomes a separate PDF</label>
              <input
                id="pdf-split-ranges"
                type="text"
                value={rangesText}
                placeholder="e.g. 1-3, 4-10, 11-"
                onChange={(event) => setRangesText(event.target.value)}
                spellCheck="false"
                autoComplete="off"
              />
            </div>
          )}

          <div className="pdf-split-action">
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={handleDownload}
              disabled={!plan?.ok || Boolean(busy)}
            >
              {busy
                ? `Creating ${busy.done}/${busy.total}…`
                : fileCount > 1
                  ? `Download ${fileCount} PDFs (ZIP)`
                  : `Download PDF${pageTotal ? ` (${pageTotal} page${pageTotal === 1 ? '' : 's'})` : ''}`}
            </button>
            {plan && !plan.ok && !(selecting && rangeError) && <p className="field-hint">{plan.error}</p>}
            {downloaded && <p className="field-hint">Downloaded. Your original PDF is unchanged.</p>}
          </div>

          <ul className="pdf-split-grid" aria-label="Pages">
            {Array.from({ length: doc.pageCount }, (_, i) => {
              const isSelected = selected.has(i);
              const classes = ['pdf-split-page'];
              if (selecting && isSelected) classes.push(mode === 'remove' ? 'removed' : 'selected');
              return (
                <li key={i}>
                  <button
                    type="button"
                    className={classes.join(' ')}
                    aria-pressed={selecting ? isSelected : undefined}
                    disabled={!selecting}
                    onClick={(event) => togglePage(i, event.shiftKey)}
                    aria-label={`Page ${i + 1}`}
                  >
                    {thumbs[i] ? <img src={thumbs[i]} alt="" /> : <span className="pdf-split-placeholder" />}
                    {selecting && isSelected && <span className="pdf-split-check" aria-hidden="true">{mode === 'remove' ? '✕' : '✓'}</span>}
                    {fileOfPage.has(i) && <span className="pdf-split-badge">File {fileOfPage.get(i)}</span>}
                  </button>
                  <span className="pdf-split-number">{i + 1}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <article className="tool-article">
        <p>
          Split a PDF into smaller files, pull out just the pages you need, or delete pages you
          don&apos;t want - right in your browser. See every page as a thumbnail, pick them with a
          click, and download the result in seconds. Your document is never uploaded.
        </p>

        <h2>How to split a PDF</h2>
        <ol>
          <li>Drop or choose a PDF. Thumbnails of every page appear.</li>
          <li>Choose what to do:
            <ul>
              <li><strong>Extract pages</strong> - click the pages you want (or type <code>1-3, 7</code>) to get one new PDF with only those pages.</li>
              <li><strong>Remove pages</strong> - click the pages to delete and get a copy without them.</li>
              <li><strong>Split every N pages</strong> - cut a long document into equal parts.</li>
              <li><strong>Split by ranges</strong> - type ranges like <code>1-5, 6-12, 13-</code>; each becomes its own file.</li>
              <li><strong>One PDF per page</strong> - every page as a separate file.</li>
            </ul>
          </li>
          <li>Press Download. Several files arrive together in a ZIP.</li>
        </ol>

        <h2>Quality and what&apos;s kept</h2>
        <p>
          Pages are copied exactly as they are - nothing is re-compressed or turned into images -
          so text stays sharp and selectable, links and form fields on those pages keep working,
          and file sizes stay small. The document title and author carry over to every part.
          Your original file is never changed.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Is my PDF uploaded?</h3>
          <p>No - the PDF is read and split on your device. That makes this safe for contracts, statements and other private documents.</p>
        </div>
        <div className="faq-item">
          <h3>Can I split a password-protected PDF?</h3>
          <p>Not directly - encrypted PDFs can&apos;t be rebuilt in the browser. Open it with its password in a PDF reader, save or print a copy without protection, then split that.</p>
        </div>
        <div className="faq-item">
          <h3>How do I combine pages from several PDFs?</h3>
          <p>Use <Link to="/tool/pdf-merge">PDF Merge</Link>, which can also take only certain pages from each file.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Turn pages into pictures with <Link to="/tool/pdf-to-image">PDF to Image</Link>, make a PDF
          from photos with <Link to="/tool/image-to-pdf">Image to PDF</Link>, or browse all{' '}
          <Link to="/category/text-data">Text &amp; Data tools</Link>.
        </p>
      </article>
    </div>
  );
}
