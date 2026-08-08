import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';
import {
  FIT_MODES,
  LAYOUTS,
  MARGINS,
  ORIENTATIONS,
  PAGE_NUMBER_POSITIONS,
  PAGE_SIZES,
  QUALITY_PRESETS,
  calculatePageLayout,
  clearImages,
  generatePdf,
  loadImages,
  reorderImages,
} from './imageToPdfUtils.js';

// Rough per-image size estimate for the "Estimated PDF size" display shown
// before generation - actual output size (shown after Generate PDF) comes
// straight from the real Blob instead. Just enough to give a sense of
// scale while adjusting settings, not a precise prediction.
const ESTIMATE_RATIOS = { high: 0.9, balanced: 0.5, smallest: 0.25 };
function estimatePdfSize(images, qualityPresetId) {
  const ratio = ESTIMATE_RATIOS[qualityPresetId] ?? ESTIMATE_RATIOS.balanced;
  return images.reduce((sum, image) => sum + image.file.size, 0) * ratio;
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function ImageToPdf() {
  const fileInputRef = useRef(null);
  const replaceInputRef = useRef(null);

  const [images, setImages] = useState([]);
  const [isDragging, setIsDragging] = useState(false); // dropzone drag-over state
  const [dragItemIndex, setDragItemIndex] = useState(null); // list-reorder drag state
  const [dragOverItemIndex, setDragOverItemIndex] = useState(null);
  const [fileErrors, setFileErrors] = useState([]); // per-file rejection messages from the last batch
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [pendingReplaceFiles, setPendingReplaceFiles] = useState(null);

  const [pageSizeId, setPageSizeId] = useState('a4');
  const [orientationId, setOrientationId] = useState('auto');
  const [marginId, setMarginId] = useState('medium');
  const [fitMode, setFitMode] = useState('fit');
  const [layoutCount, setLayoutCount] = useState(1);
  const [qualityPresetId, setQualityPresetId] = useState('balanced');
  const [pageNumbering, setPageNumbering] = useState('none');

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(null); // { current, total }
  const [generateError, setGenerateError] = useState('');
  const [pdfBlob, setPdfBlob] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');

  // Revoke every image's object URL when the component unmounts, so
  // navigating away doesn't leak memory for whatever was still loaded.
  useEffect(() => {
    return () => {
      images.forEach((image) => URL.revokeObjectURL(image.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup should only run on unmount, not on every images change
  }, []);

  // Any settings change invalidates the previously generated PDF - it no
  // longer reflects what's on screen, so clear it rather than let the
  // download button silently serve a stale file.
  useEffect(() => {
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    setPdfBlob(null);
  }, [images, pageSizeId, orientationId, marginId, fitMode, layoutCount, qualityPresetId, pageNumbering]);

  async function handleFiles(fileList) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    const results = await loadImages(files);
    const added = results.filter((r) => r.ok).map((r) => r.item);
    const rejected = results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`);

    if (added.length > 0) setImages((prev) => [...prev, ...added]);
    setFileErrors(rejected);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  }

  function handleRemove(id) {
    setImages((prev) => {
      const target = prev.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((image) => image.id !== id);
    });
  }

  function handleMove(index, direction) {
    setImages((prev) => reorderImages(prev, index, index + direction));
  }

  // --- Drag-and-drop reordering ---------------------------------------------
  // Native HTML5 drag-and-drop between list items. "Move up"/"Move down"
  // buttons above cover the same action for keyboard and screen-reader
  // users, since native drag-and-drop has no built-in keyboard equivalent.

  function handleItemDragStart(index) {
    setDragItemIndex(index);
  }
  function handleItemDragOver(event, index) {
    event.preventDefault();
    setDragOverItemIndex(index);
  }
  function handleItemDrop(index) {
    if (dragItemIndex !== null) setImages((prev) => reorderImages(prev, dragItemIndex, index));
    setDragItemIndex(null);
    setDragOverItemIndex(null);
  }
  function handleItemDragEnd() {
    setDragItemIndex(null);
    setDragOverItemIndex(null);
  }

  function doClear() {
    setImages((prev) => clearImages(prev));
    setPageSizeId('a4');
    setOrientationId('auto');
    setMarginId('medium');
    setFitMode('fit');
    setLayoutCount(1);
    setQualityPresetId('balanced');
    setPageNumbering('none');
    setFileErrors([]);
    setGenerateError('');
  }

  function handleClearClick() {
    if (hasUnsavedWork) setShowClearConfirm(true);
    else doClear();
  }

  // "Replace Images" discards the current list (with the same confirm as
  // Clear, since it's just as destructive) and immediately re-opens the
  // file picker so the user doesn't have to click twice.
  function handleReplaceClick() {
    if (hasUnsavedWork) {
      setPendingReplaceFiles('prompt');
      setShowClearConfirm(true);
    } else {
      replaceInputRef.current?.click();
    }
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setGenerateError('');
    setProgress({ current: 0, total: Math.ceil(images.length / layoutCount) });
    try {
      const blob = await generatePdf({
        images,
        pageSizeId,
        orientationId,
        marginId,
        fitMode,
        layoutCount,
        qualityPresetId,
        pageNumbering,
        onProgress: (current, total) => setProgress({ current, total }),
      });
      setPdfBlob(blob);
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (error) {
      setGenerateError(error.message || 'Something went wrong generating the PDF.');
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  }

  const pageCount = Math.ceil(images.length / layoutCount) || 0;
  const estimatedSize = images.length > 0 ? estimatePdfSize(images, qualityPresetId) : 0;

  // "Unsaved work" means: at least one image is loaded - loading, removing,
  // reordering images, and changing any PDF/quality/layout/numbering
  // setting all happen through the same `images`/settings state, so this
  // single check covers every trigger the spec calls out.
  const hasUnsavedWork = images.length > 0;
  useUnsavedChangesWarning(hasUnsavedWork);

  return (
    <div className="image-to-pdf">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      {showClearConfirm && (
        <ConfirmDialog
          title={pendingReplaceFiles ? 'Discard these images?' : 'Clear all images?'}
          message={
            pendingReplaceFiles
              ? 'You have unsaved work. Replacing your images will discard the current list and settings.'
              : 'You have unsaved work. Clearing will remove every image and reset settings to their defaults.'
          }
          confirmLabel={pendingReplaceFiles ? 'Discard and replace' : 'Discard and clear'}
          onCancel={() => {
            setShowClearConfirm(false);
            setPendingReplaceFiles(null);
          }}
          onConfirm={() => {
            setShowClearConfirm(false);
            doClear();
            if (pendingReplaceFiles) {
              setPendingReplaceFiles(null);
              replaceInputRef.current?.click();
            }
          }}
        />
      )}

      {/* Hidden input used only by "Replace Images", so it can trigger a
          fresh picker without rendering a second visible drop zone. */}
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="visually-hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />

      {images.length === 0 ? (
        <div
          className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
          role="button"
          tabIndex={0}
          aria-label="Drag and drop, or click to choose one or more images to convert to PDF"
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
          <p className="drop-zone-title">Drag &amp; drop, or click to browse</p>
          <p className="drop-zone-hint">Choose one or more PNG, JPG, or WebP images to combine into a PDF</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="visually-hidden"
            aria-label="Choose image files"
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </div>
      ) : (
        <>
          <div className="converter-toolbar">
            <button type="button" className="ghost-button" onClick={handleReplaceClick}>
              &larr; Replace Images
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => fileInputRef.current?.click()}
            >
              + Add more images
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="visually-hidden"
              aria-label="Add more image files"
              onChange={(event) => {
                handleFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </div>

          {fileErrors.length > 0 && (
            <div className="field-error">
              {fileErrors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}

          <h2 className="pdf-section-heading">
            Images ({images.length}) &mdash; drag to reorder, or use the arrow buttons
          </h2>
          <ul className="pdf-image-list" aria-label="Images in PDF page order">
            {images.map((image, index) => (
              <li
                key={image.id}
                className={
                  dragOverItemIndex === index ? 'pdf-image-item drag-over' : 'pdf-image-item'
                }
                draggable
                onDragStart={() => handleItemDragStart(index)}
                onDragOver={(event) => handleItemDragOver(event, index)}
                onDrop={() => handleItemDrop(index)}
                onDragEnd={handleItemDragEnd}
              >
                <span className="pdf-image-position" aria-hidden="true">
                  {index + 1}
                </span>
                <img src={image.url} alt="" className="pdf-image-thumb" />
                <div className="pdf-image-info">
                  <p className="pdf-image-name">{image.file.name}</p>
                  <p className="pdf-image-meta">
                    {image.width}&times;{image.height} &middot; {formatBytes(image.file.size)}
                  </p>
                </div>
                <div className="pdf-image-actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => handleMove(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${image.file.name} up`}
                  >
                    &uarr;
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => handleMove(index, 1)}
                    disabled={index === images.length - 1}
                    aria-label={`Move ${image.file.name} down`}
                  >
                    &darr;
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => handleRemove(image.id)}
                    aria-label={`Remove ${image.file.name}`}
                  >
                    &times;
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="unit-converter-row">
            <div className="field">
              <label htmlFor="pdf-page-size">Page size</label>
              <select id="pdf-page-size" value={pageSizeId} onChange={(event) => setPageSizeId(event.target.value)}>
                {Object.entries(PAGE_SIZES).map(([id, size]) => (
                  <option key={id} value={id}>
                    {size.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pdf-orientation">Orientation</label>
              <select
                id="pdf-orientation"
                value={orientationId}
                onChange={(event) => setOrientationId(event.target.value)}
              >
                {Object.entries(ORIENTATIONS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pdf-margin">Margins</label>
              <select id="pdf-margin" value={marginId} onChange={(event) => setMarginId(event.target.value)}>
                {Object.entries(MARGINS).map(([id, margin]) => (
                  <option key={id} value={id}>
                    {margin.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="unit-converter-row">
            <div className="field">
              <label htmlFor="pdf-fit">Image fit</label>
              <select id="pdf-fit" value={fitMode} onChange={(event) => setFitMode(event.target.value)}>
                {Object.entries(FIT_MODES).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pdf-layout">Images per page</label>
              <select
                id="pdf-layout"
                value={layoutCount}
                onChange={(event) => setLayoutCount(Number(event.target.value))}
              >
                {LAYOUTS.map((count) => (
                  <option key={count} value={count}>
                    {count} {count === 1 ? 'image' : 'images'} per page
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pdf-numbering">Page numbers</label>
              <select
                id="pdf-numbering"
                value={pageNumbering}
                onChange={(event) => setPageNumbering(event.target.value)}
              >
                {Object.entries(PAGE_NUMBER_POSITIONS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="field password-options-fieldset">
            <legend>Image quality</legend>
            {Object.entries(QUALITY_PRESETS).map(([id, preset]) => (
              <label key={id} className="checkbox-field">
                <input
                  type="radio"
                  name="pdf-quality"
                  value={id}
                  checked={qualityPresetId === id}
                  onChange={() => setQualityPresetId(id)}
                />
                {preset.label}
              </label>
            ))}
          </fieldset>

          <PagePreview
            pageSizeId={pageSizeId}
            orientationId={orientationId}
            marginId={marginId}
            fitMode={fitMode}
            layoutCount={layoutCount}
            images={images}
          />

          <dl className="comparison-meta pdf-summary">
            <div>
              <dt>Images</dt>
              <dd>{images.length}</dd>
            </div>
            <div>
              <dt>Estimated pages</dt>
              <dd>{pageCount}</dd>
            </div>
            <div>
              <dt>{pdfBlob ? 'PDF size' : 'Estimated PDF size'}</dt>
              <dd>{formatBytes(pdfBlob ? pdfBlob.size : estimatedSize)}</dd>
            </div>
          </dl>

          {generateError && <p className="field-error">{generateError}</p>}

          <div className="converter-toolbar">
            <button
              type="button"
              className="download-button"
              onClick={handleGenerate}
              disabled={isGenerating || images.length === 0}
            >
              {isGenerating
                ? `Generating… (${progress?.current ?? 0}/${progress?.total ?? 0})`
                : 'Generate PDF'}
            </button>
            {pdfUrl && pdfBlob && (
              <a className="download-button" href={pdfUrl} download="images.pdf">
                Download PDF
              </a>
            )}
            <button type="button" className="ghost-button" onClick={handleClearClick}>
              Clear
            </button>
          </div>
        </>
      )}

      <article className="tool-article">
        <p>
          Combine one or more images into a single, shareable PDF entirely in your browser - pick
          a page size, choose how many images go on each page, and download the result. Nothing
          is uploaded anywhere; every image is read, laid out, and encoded locally.
        </p>

        <h2>How to convert images to PDF</h2>
        <ol>
          <li>Drag and drop images (or click to browse), in any order - PNG, JPG, and WebP are all supported.</li>
          <li>Reorder them by dragging, or with the &uarr;/&darr; buttons - this is the order pages will appear in.</li>
          <li>Pick page size, orientation, margins, fit, layout, quality, and page numbering.</li>
          <li>Click "Generate PDF", check the page preview, then "Download PDF".</li>
        </ol>

        <h2>Supported image formats</h2>
        <p>PNG, JPG/JPEG, and WebP images can be added - they don't all need to be the same format within one PDF.</p>

        <h2>How image quality affects PDF size</h2>
        <p>
          "High Quality" embeds each image losslessly as PNG, which keeps every pixel intact but
          produces the largest file. "Balanced" and "Smallest File" re-encode images as JPEG at
          progressively lower quality (and, for very large images, downscale them first) - a good
          default for PDFs meant to be emailed or shared rather than printed.
        </p>

        <h2>One image per page vs multiple</h2>
        <p>
          One image per page keeps each photo as large and clear as possible - the natural choice
          for documents or scans. Multiple images per page (2, 4, or 6) suits contact sheets,
          photo collages, or anything where you'd rather flip through fewer pages.
        </p>

        <h2>Tips for high-quality PDFs</h2>
        <ul>
          <li>Use "Fit to page" to keep the whole image visible; use "Fill page" only when a bit of cropping is fine.</li>
          <li>"Original size" is best for images already sized for printing - large photos may not fit a single page at full size.</li>
          <li>If the PDF is only for viewing on screen, "Balanced" quality usually looks identical to "High Quality" at a fraction of the file size.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Can I add images from more than one upload?</h3>
          <p>Yes - use "+ Add more images" to append additional files to the existing list without starting over.</p>
        </div>
        <div className="faq-item">
          <h3>Can each page have a different layout?</h3>
          <p>Not currently - the chosen "images per page" layout applies to every page. Generate separate PDFs if you need different layouts per page.</p>
        </div>
        <div className="faq-item">
          <h3>What does "Auto" page size do?</h3>
          <p>For a one-image-per-page layout, each page is sized to match that image's own proportions. For multi-image layouts, there's no single image to match, so it falls back to A4.</p>
        </div>
        <div className="faq-item">
          <h3>Will my images lose quality?</h3>
          <p>Only if you choose "Balanced" or "Smallest File", which re-encode images as compressed JPEG. "High Quality" embeds them losslessly.</p>
        </div>
        <div className="faq-item">
          <h3>Are my images uploaded anywhere?</h3>
          <p>No - every step, including PDF generation, happens entirely in your browser using the Canvas API and a local PDF library. Nothing leaves your device.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Also try the <Link to="/tool/image-resizer">Image Resizer &amp; Cropper</Link>, the{' '}
          <Link to="/tool/image-compressor">Image Compressor</Link>, or browse the rest of the{' '}
          <Link to="/category/text-data">Text &amp; Data tools</Link> on Rootconverter.
        </p>
      </article>
    </div>
  );
}

// A schematic (not pixel-perfect) preview of how the FIRST page will look
// with the current settings - built from plain CSS so it stays cheap to
// re-render on every settings change, rather than re-running the real
// canvas/jsPDF pipeline just to show a preview.
function PagePreview({ pageSizeId, orientationId, marginId, fitMode, layoutCount, images }) {
  const firstPageImages = images.slice(0, layoutCount);

  let width;
  let height;
  if (pageSizeId === 'auto' && firstPageImages.length === 1) {
    width = firstPageImages[0].width;
    height = firstPageImages[0].height;
  } else {
    const size = PAGE_SIZES[pageSizeId] ?? PAGE_SIZES.a4;
    width = size.width ?? 210;
    height = size.height ?? 297;
  }

  let wantLandscape;
  if (orientationId === 'landscape') wantLandscape = true;
  else if (orientationId === 'portrait') wantLandscape = false;
  else {
    const landscapeCount = firstPageImages.filter((image) => image.width >= image.height).length;
    wantLandscape = landscapeCount >= firstPageImages.length / 2;
  }
  const isCurrentlyLandscape = width >= height;
  if (wantLandscape !== isCurrentlyLandscape) [width, height] = [height, width];

  const marginMm = MARGINS[marginId]?.mm ?? 0;
  const { cells } = calculatePageLayout(width, height, marginMm, layoutCount);

  return (
    <div className="field">
      <p className="field-hint">Page layout preview (page 1 of {Math.ceil(images.length / layoutCount) || 0})</p>
      <div className="pdf-page-preview" style={{ aspectRatio: `${width} / ${height}` }}>
        {cells.map((cell, index) => {
          const image = firstPageImages[index];
          return (
            <div
              key={index}
              className="pdf-page-preview-cell"
              style={{
                left: `${(cell.x / width) * 100}%`,
                top: `${(cell.y / height) * 100}%`,
                width: `${(cell.width / width) * 100}%`,
                height: `${(cell.height / height) * 100}%`,
              }}
            >
              {image && (
                <img
                  src={image.url}
                  alt=""
                  className="pdf-page-preview-image"
                  style={{ objectFit: fitMode === 'fill' ? 'cover' : 'contain' }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
