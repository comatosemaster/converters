import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { usePasteToUpload } from '../../hooks/usePasteToUpload.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { pointerToCanvasPixel } from '../image-color-picker/imageColorPickerUtils.js';
import {
  SUPPORTED_TYPES,
  buildDownloadName,
  computeCanvasSize,
  growSelectionBounds,
  inpaintRegion,
  padBounds,
  validateImageFile,
} from './watermarkRemovalUtils.js';

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// Two live canvases are stacked on top of each other: `baseCanvas` holds
// the actual working image (updated in place each time a removal is
// applied), and `maskCanvas` is a transparent overlay the brush paints
// onto - its own alpha channel *is* the selection, read directly by
// inpaintRegion() at removal time. Coordinate mapping for both painting
// and (previously) the color picker's canvas reuses the same
// pointerToCanvasPixel() helper rather than duplicating that math.

const SELECTION_PAINT_COLOR = 'rgba(239, 68, 68, 0.55)';
const MIN_BRUSH_SIZE = 5;
const MAX_BRUSH_SIZE = 150;
const DEFAULT_BRUSH_SIZE = 30;

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Your browser couldn't create this image."));
        else resolve(blob);
      },
      mime,
      quality,
    );
  });
}

function waitTwoFrames() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

export default function WatermarkRemover() {
  const fileInputRef = useRef(null);
  const baseCanvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const isPaintingRef = useRef(false);
  const lastPointRef = useRef(null);
  const outputMimeRef = useRef('image/png');

  const [file, setFile] = useState(null);
  const [dimensions, setDimensions] = useState(null); // working canvas { width, height }
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const [tool, setTool] = useState('paint'); // 'paint' | 'erase'
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);
  const [selectionBounds, setSelectionBounds] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasProcessedOnce, setHasProcessedOnce] = useState(false);

  const [originalUrl, setOriginalUrl] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [comparePercent, setComparePercent] = useState(50);

  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);

  // Decodes the chosen file once, draws it onto the working canvases at a
  // memory-safe capped resolution, and captures a compressed snapshot
  // (two independent object URLs from the same blob) used as the
  // compare slider's "Original" side.
  useEffect(() => {
    if (!file) {
      setDimensions(null);
      setOriginalUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      setCurrentUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      return;
    }

    let cancelled = false;
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = async () => {
      if (cancelled) return;
      const baseCanvas = baseCanvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      if (!baseCanvas || !maskCanvas) return;

      const size = computeCanvasSize(img.naturalWidth, img.naturalHeight);
      baseCanvas.width = size.width;
      baseCanvas.height = size.height;
      maskCanvas.width = size.width;
      maskCanvas.height = size.height;

      const baseCtx = baseCanvas.getContext('2d');
      if (!baseCtx) {
        setError("Your browser doesn't support the features this tool needs.");
        return;
      }
      baseCtx.drawImage(img, 0, 0, size.width, size.height);
      maskCanvas.getContext('2d')?.clearRect(0, 0, size.width, size.height);

      outputMimeRef.current = SUPPORTED_TYPES.includes(file.type) ? file.type : 'image/png';

      setDimensions({ width: size.width, height: size.height });
      setSelectionBounds(null);
      setHasProcessedOnce(false);
      setComparePercent(50);
      setError('');

      try {
        const quality = outputMimeRef.current === 'image/png' ? undefined : 0.92;
        const blob = await canvasToBlob(baseCanvas, outputMimeRef.current, quality);
        if (cancelled) return;
        // Two separate object URLs from the same blob so the "original"
        // snapshot survives independently of whatever the "current" URL
        // gets revoked and replaced with after later edits.
        const url1 = URL.createObjectURL(blob);
        const url2 = URL.createObjectURL(blob);
        setOriginalUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url1;
        });
        setCurrentUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url2;
        });
      } catch {
        if (!cancelled) setError("Your browser couldn't process this image.");
      }
    };
    img.onerror = () => {
      if (!cancelled) setError('Could not read that image file - it may be corrupted.');
    };
    img.src = objectUrl;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  async function refreshCurrentUrl() {
    const baseCanvas = baseCanvasRef.current;
    if (!baseCanvas) return;
    try {
      const quality = outputMimeRef.current === 'image/png' ? undefined : 0.92;
      const blob = await canvasToBlob(baseCanvas, outputMimeRef.current, quality);
      const url = URL.createObjectURL(blob);
      setCurrentUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      setError("Your browser couldn't generate the result image.");
    }
  }

  function handleFile(selectedFile) {
    if (!selectedFile) return;
    const validation = validateImageFile(selectedFile);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setError('');
    setFile(selectedFile);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files[0]);
  }

  function handleReplace() {
    setFile(null);
  }

  function handleReplaceClick() {
    if (hasUnsavedWork) {
      setPendingFile(null);
      setShowReplaceConfirm(true);
    } else {
      handleReplace();
    }
  }

  function handlePastedFile(newFile) {
    if (hasUnsavedWork) {
      setPendingFile(newFile);
      setShowReplaceConfirm(true);
    } else {
      handleFile(newFile);
    }
  }

  function paintAt(prevPoint, point) {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    if (tool === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = SELECTION_PAINT_COLOR;
    }
    ctx.beginPath();
    ctx.moveTo(prevPoint ? prevPoint.x : point.x, prevPoint ? prevPoint.y : point.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  function handlePointerDown(event) {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerToCanvasPixel(maskCanvas, event.clientX, event.clientY);
    isPaintingRef.current = true;
    lastPointRef.current = point;
    paintAt(null, point);
    // Only paint strokes grow the tracked selection bounds - an
    // erase-only stroke can only shrink what's already selected, and the
    // mask canvas's own alpha (read at removal time) already reflects
    // that precisely, so there's nothing to grow here.
    if (tool === 'paint') {
      setSelectionBounds((prev) =>
        growSelectionBounds(prev, point.x, point.y, brushSize / 2, maskCanvas.width, maskCanvas.height),
      );
    }
    setError('');
  }

  function handlePointerMove(event) {
    if (!isPaintingRef.current) return;
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const point = pointerToCanvasPixel(maskCanvas, event.clientX, event.clientY);
    paintAt(lastPointRef.current, point);
    if (tool === 'paint') {
      setSelectionBounds((prev) =>
        growSelectionBounds(prev, point.x, point.y, brushSize / 2, maskCanvas.width, maskCanvas.height),
      );
    }
    lastPointRef.current = point;
  }

  function handlePointerUp(event) {
    isPaintingRef.current = false;
    lastPointRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleClearSelection() {
    const maskCanvas = maskCanvasRef.current;
    if (maskCanvas) {
      maskCanvas.getContext('2d').clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    }
    setSelectionBounds(null);
  }

  async function handleRemove() {
    if (!selectionBounds) {
      setError('Select the area you want to remove first.');
      return;
    }
    const baseCanvas = baseCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!baseCanvas || !maskCanvas || !dimensions) return;

    setError('');
    setStatusMessage('Removing the selected area…');
    setIsProcessing(true);
    // Let the "Removing…" state actually paint before the synchronous
    // pixel-math work below starts.
    await waitTwoFrames();

    try {
      const selectionSize = Math.max(
        selectionBounds.maxX - selectionBounds.minX,
        selectionBounds.maxY - selectionBounds.minY,
      );
      // Generous context around the selection: the fill copies texture from
      // here, so more surrounding image means better matches to choose from.
      const padding = Math.max(48, Math.round(selectionSize * 0.75));
      const region = padBounds(selectionBounds, padding, dimensions.width, dimensions.height);
      const regionWidth = region.maxX - region.x + 1;
      const regionHeight = region.maxY - region.y + 1;

      const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
      const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
      const srcData = baseCtx.getImageData(region.x, region.y, regionWidth, regionHeight);
      const maskData = maskCtx.getImageData(region.x, region.y, regionWidth, regionHeight);

      const filled = await inpaintRegion(srcData.data, maskData.data, regionWidth, regionHeight);
      baseCtx.putImageData(new ImageData(filled, regionWidth, regionHeight), region.x, region.y);

      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      setSelectionBounds(null);
      setHasProcessedOnce(true);
      setComparePercent(50);
      await refreshCurrentUrl();
      setStatusMessage('Watermark removed. Compare the result below, or select another area.');
    } catch {
      setError('Something went wrong while removing that area. Try a smaller selection.');
      setStatusMessage('');
    } finally {
      setIsProcessing(false);
    }
  }

  function handleReset() {
    const baseCanvas = baseCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!baseCanvas || !originalUrl) return;

    const img = new Image();
    img.onload = () => {
      const ctx = baseCanvas.getContext('2d');
      ctx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
      ctx.drawImage(img, 0, 0, baseCanvas.width, baseCanvas.height);
      refreshCurrentUrl();
    };
    img.src = originalUrl;

    if (maskCanvas) {
      maskCanvas.getContext('2d').clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    }
    setSelectionBounds(null);
    setHasProcessedOnce(false);
    setComparePercent(50);
    setError('');
    setStatusMessage('Reset to the original image.');
  }

  const hasUnsavedWork = Boolean(file);
  useUnsavedChangesWarning(hasUnsavedWork);
  usePasteToUpload(true, handlePastedFile);

  return (
    <div className="watermark-remover">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      {!file ? (
        <>
          <div
            className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
            role="button"
            tabIndex={0}
            aria-label="Drag and drop, paste, or click to choose an image to edit"
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
            <p className="drop-zone-hint">Paint over a watermark or unwanted area, then remove it</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="visually-hidden"
              aria-label="Choose an image file"
              onChange={(event) => handleFile(event.target.files[0])}
            />
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="converter-toolbar">
            <button type="button" className="ghost-button" onClick={handleReplaceClick}>
              &larr; Choose a different image
            </button>
            <button type="button" className="ghost-button" onClick={handleReset}>
              Reset
            </button>
          </div>

          {showReplaceConfirm && (
            <ConfirmDialog
              title="Discard this image?"
              message={
                pendingFile
                  ? 'You have unsaved work on this image. Pasting a new one will discard it.'
                  : 'You have unsaved work on this image. Choosing a different one will discard your selection and any removal results.'
              }
              confirmLabel={pendingFile ? 'Discard and load pasted image' : 'Discard and choose another'}
              onCancel={() => {
                setShowReplaceConfirm(false);
                setPendingFile(null);
              }}
              onConfirm={() => {
                setShowReplaceConfirm(false);
                if (pendingFile) {
                  handleFile(pendingFile);
                  setPendingFile(null);
                } else {
                  handleReplace();
                }
              }}
            />
          )}

          <div className="field">
            <label htmlFor="watermark-brush-size">Brush size: {brushSize}px</label>
            <input
              id="watermark-brush-size"
              type="range"
              min={MIN_BRUSH_SIZE}
              max={MAX_BRUSH_SIZE}
              value={brushSize}
              disabled={!dimensions}
              onChange={(event) => setBrushSize(Number(event.target.value))}
            />
          </div>

          <div className="watermark-brush-toolbar">
            <div className="mode-toggle" role="group" aria-label="Brush tool">
              <button
                type="button"
                className={tool === 'paint' ? 'mode-button active' : 'mode-button'}
                aria-pressed={tool === 'paint'}
                disabled={!dimensions}
                onClick={() => setTool('paint')}
              >
                Paint
              </button>
              <button
                type="button"
                className={tool === 'erase' ? 'mode-button active' : 'mode-button'}
                aria-pressed={tool === 'erase'}
                disabled={!dimensions}
                onClick={() => setTool('erase')}
              >
                Eraser
              </button>
            </div>
            <button type="button" className="ghost-button" disabled={!dimensions} onClick={handleClearSelection}>
              Clear Selection
            </button>
          </div>

          {/* Both canvases are always mounted once a file is chosen (not
              gated behind `dimensions`) - the image-decode effect needs
              these refs to already exist in order to draw onto them and
              set `dimensions` in the first place. */}
          <div
            className="watermark-canvas-stack"
            style={dimensions ? { aspectRatio: `${dimensions.width} / ${dimensions.height}` } : undefined}
          >
            <canvas ref={baseCanvasRef} className="watermark-base-canvas" />
            <canvas
              ref={maskCanvasRef}
              className="watermark-mask-canvas"
              aria-label="Image preview. Paint over the area to remove using a mouse or touch."
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
          </div>

          {!dimensions && !error && <p className="category-empty">Loading image…</p>}

          <button
            type="button"
            className="btn btn-primary"
            disabled={!dimensions || isProcessing}
            onClick={handleRemove}
          >
            {isProcessing ? 'Removing…' : 'Remove Watermark'}
          </button>

          <p className="field-hint" aria-live="polite">
            {statusMessage ||
              "Cover the whole watermark, including its faint edges. The selection is rebuilt from texture around it, so results depend on what's nearby."}
          </p>

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          {dimensions && (
            <>
              {hasProcessedOnce && originalUrl && currentUrl && (
                <div className="watermark-compare-section">
                  <h3>Compare</h3>
                  <div
                    className="watermark-compare"
                    style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}
                  >
                    <img src={originalUrl} alt="Original, before removal" className="watermark-compare-image" />
                    <img
                      src={currentUrl}
                      alt="Result, after removal"
                      className="watermark-compare-image"
                      style={{ clipPath: `inset(0 ${100 - comparePercent}% 0 0)` }}
                    />
                    <div className="watermark-compare-handle" style={{ left: `${comparePercent}%` }} />
                  </div>
                  <input
                    type="range"
                    className="watermark-compare-slider"
                    min={0}
                    max={100}
                    value={comparePercent}
                    aria-label="Comparison position between original and result"
                    onChange={(event) => setComparePercent(Number(event.target.value))}
                  />
                  <div className="mode-toggle watermark-compare-toggle">
                    <button
                      type="button"
                      className={comparePercent === 0 ? 'mode-button active' : 'mode-button'}
                      onClick={() => setComparePercent(0)}
                    >
                      Original
                    </button>
                    <button
                      type="button"
                      className={comparePercent === 100 ? 'mode-button active' : 'mode-button'}
                      onClick={() => setComparePercent(100)}
                    >
                      Result
                    </button>
                  </div>
                </div>
              )}

              <div className="converter-toolbar">
                <a
                  className="download-button"
                  href={currentUrl}
                  download={file ? buildDownloadName(file.name, outputMimeRef.current) : undefined}
                >
                  Download Image
                </a>
              </div>
            </>
          )}
        </>
      )}

      <article className="tool-article">
        <p>
          Paint over a watermark, logo, or other unwanted area, click Remove Watermark, and this
          tool reconstructs that area from the pixels around it - entirely in your browser. Your
          image never leaves your device.
        </p>

        <h2>How removal works</h2>
        <p>
          This tool uses a content-aware fill: it rebuilds the selected area by copying small
          patches of real texture from the surrounding image - the grain of wood, blades of
          grass, a brick pattern, the noise in a photo - choosing the patches that best continue
          what's around the selection. It works from a small, blurry version of the image up to
          full size, so large shapes like a horizon line are continued before the fine detail is
          filled in. It isn't an AI model: it can only reuse what's already in the picture, so it
          can't recreate something the watermark completely hid, like a face or a line of text.
        </p>

        <h2>Selecting the area to remove</h2>
        <p>
          Use the <strong>Paint</strong> brush to cover the watermark - you can make several
          separate strokes or selections before removing anything. Switch to <strong>Eraser</strong>{' '}
          to correct part of a selection, adjust the brush size slider for finer or broader
          control, or use <strong>Clear Selection</strong> to start over. Once you're happy with
          the selection, click <strong>Remove Watermark</strong>; you can then paint a new
          selection on the result and remove again if anything is left.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Will this perfectly remove any watermark?</h3>
          <p>
            No - results depend on the watermark's size and on what surrounds it. Watermarks over
            sky, walls, fabric, grass and other repeating textures usually disappear cleanly.
            Very large selections, or watermarks covering unique detail that appears nowhere else
            in the image, may need a second pass or show a visible seam.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my image uploaded anywhere?</h3>
          <p>
            No - the image is decoded and processed entirely on your device using the Canvas API.
            It's never sent to a server, and no analytics or image-processing APIs are involved.
          </p>
        </div>
        <div className="faq-item">
          <h3>What happens with very large images?</h3>
          <p>
            Images are processed at their original resolution up to 4000 pixels on the longest
            side; larger uploads are automatically scaled down to that limit to keep memory usage
            safe in the browser. The actual removal only touches the area around your selection,
            not the whole image, so it stays fast regardless of the overall image size.
          </p>
        </div>
        <div className="faq-item">
          <h3>Can I remove more than one watermark?</h3>
          <p>
            Yes - paint over multiple separate areas before clicking Remove Watermark, or remove
            one area, then paint and remove again for another. Areas outside your selection are
            always left untouched.
          </p>
        </div>
        <div className="faq-item">
          <h3>What image formats are supported?</h3>
          <p>
            Upload PNG, JPG/JPEG, or WebP. The download preserves your original format where
            possible; if that isn't practical, it falls back to PNG.
          </p>
        </div>

        <h2>Related tools</h2>
        <p>
          Also try the <Link to="/tool/image-flipper">Image Flipper</Link>, the{' '}
          <Link to="/tool/image-resizer">Image Resizer &amp; Cropper</Link>, or browse the rest of
          the <Link to="/category/graphics-media">Graphics &amp; Media tools</Link> on
          NeatSize.
        </p>
      </article>
    </div>
  );
}
