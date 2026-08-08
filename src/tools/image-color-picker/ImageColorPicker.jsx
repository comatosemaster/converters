import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { usePasteToUpload } from '../../hooks/usePasteToUpload.js';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import { formatHsl, formatRgb, parseColor, rgbToHex } from '../color-converter/colorConversions.js';
import { computeCanvasSize, pointerToCanvasPixel, validateImageFile } from './imageColorPickerUtils.js';

// A small zoomed-in preview of the pixels around the cursor, drawn with
// image smoothing disabled so it reads as a crisp pixel grid rather than a
// blur - genuinely useful for landing on the exact pixel you meant, not
// just decorative.
const MAGNIFIER_SOURCE_PX = 9; // odd, so there's a true center pixel
const MAGNIFIER_SIZE = 108; // 12x scale

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// Reading a pixel's color is inherently tied to the live <canvas> (mapping
// a pointer position to a backing-store pixel), so that logic lives here
// rather than in imageColorPickerUtils.js - converting the result to HEX/
// RGB/HSL text reuses color-converter's colorConversions.js directly.

export default function ImageColorPicker() {
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const magnifierRef = useRef(null);
  const imageElRef = useRef(null);

  const [file, setFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [dimensions, setDimensions] = useState(null); // canvas backing-store { width, height }
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');

  const [hoverColor, setHoverColor] = useState(null); // { r, g, b } under the cursor right now
  const [hoverPoint, setHoverPoint] = useState(null); // canvas pixel coords, for the magnifier
  const [pickedColor, setPickedColor] = useState(null); // { r, g, b } - the locked selection
  const [copiedField, setCopiedField] = useState(null);

  // Optional manual entry (see the tool's spec: "allow entering a HEX
  // value"). Reuses parseColor() from colorConversions.js, which already
  // understands HEX/RGB/HSL - no new parsing code needed for this.
  const [hexInput, setHexInput] = useState('');
  const [hexError, setHexError] = useState('');

  useDocumentMeta({
    title: 'Image Color Picker - Get HEX, RGB & HSL from an Image | Rootconverter',
    description:
      'Upload an image and pick any color from it to get its HEX, RGB, and HSL values instantly. Runs entirely in your browser using the Canvas API - no upload required.',
  });

  // Turn the chosen File into an object URL we can point <img> at.
  useEffect(() => {
    if (!file) {
      setSourceUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Loads the image once per file and draws it onto the canvas at a
  // capped size (see computeCanvasSize) - this is the ONE place pixels are
  // decoded, so hovering/clicking afterward just reads back from the
  // already-drawn canvas instead of re-decoding anything.
  useEffect(() => {
    if (!sourceUrl) {
      imageElRef.current = null;
      setDimensions(null);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      imageElRef.current = img;

      const size = computeCanvasSize(img.naturalWidth, img.naturalHeight);
      const canvas = canvasRef.current;
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, size.width, size.height);

      setDimensions(size);
      setPickedColor(null);
      setHoverColor(null);
      setHoverPoint(null);
    };
    img.onerror = () => {
      if (!cancelled) setError('Could not read that image file.');
    };
    img.src = sourceUrl;

    return () => {
      cancelled = true;
    };
  }, [sourceUrl]);

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

  function readPixelAt(x, y) {
    const ctx = canvasRef.current.getContext('2d');
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
    return { r, g, b };
  }

  function drawMagnifier(x, y) {
    const magnifier = magnifierRef.current;
    if (!magnifier || !dimensions) return;
    const mctx = magnifier.getContext('2d');
    mctx.imageSmoothingEnabled = false;

    const half = Math.floor(MAGNIFIER_SOURCE_PX / 2);
    const sx = Math.min(Math.max(x - half, 0), dimensions.width - MAGNIFIER_SOURCE_PX);
    const sy = Math.min(Math.max(y - half, 0), dimensions.height - MAGNIFIER_SOURCE_PX);

    mctx.clearRect(0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
    mctx.drawImage(
      canvasRef.current,
      sx, sy, MAGNIFIER_SOURCE_PX, MAGNIFIER_SOURCE_PX,
      0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE,
    );

    // A crosshair on the exact pixel the values below describe - the
    // magnified view alone doesn't make that pixel obvious at this zoom.
    const cellSize = MAGNIFIER_SIZE / MAGNIFIER_SOURCE_PX;
    mctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    mctx.lineWidth = 1;
    mctx.strokeRect((x - sx) * cellSize + 0.5, (y - sy) * cellSize + 0.5, cellSize - 1, cellSize - 1);
    mctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    mctx.strokeRect((x - sx) * cellSize + 1.5, (y - sy) * cellSize + 1.5, cellSize - 3, cellSize - 3);
  }

  function handlePointerMove(event) {
    if (!dimensions) return;
    const { x, y } = pointerToCanvasPixel(canvasRef.current, event.clientX, event.clientY);
    setHoverColor(readPixelAt(x, y));
    setHoverPoint({ x, y, clientX: event.clientX, clientY: event.clientY });
    drawMagnifier(x, y);
  }

  function handlePointerLeave() {
    setHoverColor(null);
    setHoverPoint(null);
  }

  function pickAt(x, y) {
    const color = readPixelAt(x, y);
    setPickedColor(color);
    setHexError('');
    setHexInput('');
  }

  function handlePointerDown(event) {
    if (!dimensions) return;
    const { x, y } = pointerToCanvasPixel(canvasRef.current, event.clientX, event.clientY);
    pickAt(x, y);
  }

  // Keyboard equivalent of clicking: the focused canvas can be nudged a
  // pixel (or 10, with Shift) at a time and locked in with Enter/Space -
  // exact pixel-picking is inherently a pointer task, but this keeps it
  // reachable without a mouse.
  function handleCanvasKeyDown(event) {
    if (!dimensions) return;
    const step = event.shiftKey ? 10 : 1;
    const current = hoverPoint ?? { x: Math.floor(dimensions.width / 2), y: Math.floor(dimensions.height / 2) };

    const moves = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    if (event.key in moves) {
      event.preventDefault();
      const delta = moves[event.key];
      const x = Math.min(Math.max(current.x + delta.x, 0), dimensions.width - 1);
      const y = Math.min(Math.max(current.y + delta.y, 0), dimensions.height - 1);
      setHoverColor(readPixelAt(x, y));
      setHoverPoint({ x, y });
      drawMagnifier(x, y);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pickAt(current.x, current.y);
    }
  }

  function handleHexInputChange(value) {
    setHexInput(value);
    if (value.trim() === '') {
      setHexError('');
      return;
    }
    const result = parseColor(value);
    if (result.ok) {
      setPickedColor(result.rgba);
      setHexError('');
    } else {
      setHexError(result.error);
    }
  }

  function handleClear() {
    setFile(null);
    setDimensions(null);
    setPickedColor(null);
    setHoverColor(null);
    setHoverPoint(null);
    setHexInput('');
    setHexError('');
    setError('');
  }

  async function handleCopy(field, text) {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  }

  const hasUnsavedWork = Boolean(file) || pickedColor !== null || hexInput.trim() !== '';
  useUnsavedChangesWarning(hasUnsavedWork);
  usePasteToUpload(!file, handleFile);

  const hex = pickedColor ? rgbToHex(pickedColor) : null;
  const rgbText = pickedColor ? formatRgb(pickedColor) : null;
  const hslText = pickedColor ? formatHsl({ ...pickedColor, a: 1 }) : null;

  return (
    <div className="image-color-picker">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      {!file ? (
        <div
          className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
          role="button"
          tabIndex={0}
          aria-label="Drag and drop, paste, or click to choose an image to pick colors from"
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
          <p className="drop-zone-hint">Hover to preview a color, click to pick it</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="visually-hidden"
            aria-label="Choose an image file"
            onChange={(event) => handleFile(event.target.files[0])}
          />
        </div>
      ) : (
        <>
          <div className="converter-toolbar">
            <button type="button" className="ghost-button" onClick={handleClear}>
              &larr; Choose a different image
            </button>
          </div>

          <div className="color-picker-canvas-wrapper">
            <canvas
              ref={canvasRef}
              className="color-picker-canvas"
              tabIndex={0}
              role="application"
              aria-label="Image color picker. Use arrow keys to move the sample point, Enter to pick the color."
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              onPointerDown={handlePointerDown}
              onKeyDown={handleCanvasKeyDown}
            />

            {hoverColor && hoverPoint?.clientX !== undefined && (
              <div
                className="color-picker-magnifier"
                style={{ left: hoverPoint.clientX + 18, top: hoverPoint.clientY + 18 }}
                aria-hidden="true"
              >
                <canvas ref={magnifierRef} width={MAGNIFIER_SIZE} height={MAGNIFIER_SIZE} />
                <span
                  className="color-picker-magnifier-swatch"
                  style={{ backgroundColor: `rgb(${hoverColor.r}, ${hoverColor.g}, ${hoverColor.b})` }}
                />
              </div>
            )}
          </div>

          {error && <p className="field-error">{error}</p>}

          <p className="field-hint">
            {pickedColor
              ? 'Click anywhere on the image to pick a different color.'
              : 'Hover to preview a color, click (or focus the image and press Enter) to pick it.'}
          </p>

          {pickedColor && (
            <div className="color-picker-result" aria-live="polite">
              <span
                className="color-preview-frame color-preview-large"
                aria-hidden="true"
              >
                <span className="color-preview-swatch" style={{ backgroundColor: rgbText }} />
              </span>

              <dl className="color-picker-values">
                <div>
                  <dt>HEX</dt>
                  <dd>
                    <code>{hex}</code>
                    <button type="button" className="copy-button" onClick={() => handleCopy('hex', hex)}>
                      {copiedField === 'hex' ? 'Copied!' : 'Copy'}
                    </button>
                  </dd>
                </div>
                <div>
                  <dt>RGB</dt>
                  <dd>
                    <code>{pickedColor.r}, {pickedColor.g}, {pickedColor.b}</code>
                    <button type="button" className="copy-button" onClick={() => handleCopy('rgb', rgbText)}>
                      {copiedField === 'rgb' ? 'Copied!' : 'Copy'}
                    </button>
                  </dd>
                </div>
                <div>
                  <dt>HSL</dt>
                  <dd>
                    <code>{hslText.replace('hsl(', '').replace(')', '')}</code>
                    <button type="button" className="copy-button" onClick={() => handleCopy('hsl', hslText)}>
                      {copiedField === 'hsl' ? 'Copied!' : 'Copy'}
                    </button>
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </>
      )}

      <div className="field color-picker-hex-entry">
        <label htmlFor="color-picker-hex-input">Or enter a HEX/RGB/HSL value directly</label>
        <input
          id="color-picker-hex-input"
          type="text"
          value={hexInput}
          onChange={(event) => handleHexInputChange(event.target.value)}
          placeholder="#6C63FF"
          autoComplete="off"
          spellCheck="false"
        />
        {hexError && <p className="field-error">{hexError}</p>}
      </div>

      {file && (
        <div className="converter-toolbar">
          <button type="button" className="ghost-button" onClick={handleClear}>
            Clear
          </button>
        </div>
      )}

      <article className="tool-article">
        <p>
          Upload an image to sample any color from it - hover to preview, click to pick, and read
          off the exact HEX, RGB, and HSL values. Everything happens locally using the Canvas API;
          the image is never uploaded anywhere.
        </p>

        <h2>How to pick a color</h2>
        <p>
          Move your cursor over the image to preview the color under it in the small magnified
          preview, then click to lock it in. The HEX, RGB, and HSL values update instantly, each
          with its own copy button. You can pick a new color at any time by clicking elsewhere on
          the image.
        </p>

        <h2>Entering a color manually</h2>
        <p>
          You don't need an image at all - type or paste a HEX, RGB, or HSL value directly into
          the field below to see its equivalents in the other formats, using the same converter
          that powers the <Link to="/tool/color-converter">Color Converter</Link>.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Is my image uploaded anywhere?</h3>
          <p>No - the image is decoded and read entirely in your browser using the Canvas API. It never leaves your device.</p>
        </div>
        <div className="faq-item">
          <h3>Why does a very large image look slightly different when picked?</h3>
          <p>
            Very large images are scaled down before being drawn to the canvas, to keep memory
            usage reasonable - colors are preserved accurately, but picking is done on the scaled
            version rather than the original full resolution.
          </p>
        </div>
        <div className="faq-item">
          <h3>Can I pick a color without a mouse?</h3>
          <p>
            Yes - click the image once to focus it, then use the arrow keys (hold Shift to move
            faster) to move the sample point and press Enter or Space to pick that pixel's color.
          </p>
        </div>
        <div className="faq-item">
          <h3>What image formats are supported?</h3>
          <p>PNG, JPG/JPEG, and WebP.</p>
        </div>
        <div className="faq-item">
          <h3>Does this support transparency?</h3>
          <p>
            The picker reads the visible red, green, and blue channels at each pixel. Fully or
            partially transparent areas of a PNG still return the color stored there, even though
            it may not be visible against the page background.
          </p>
        </div>

        <h2>Related tools</h2>
        <p>
          Also try the <Link to="/tool/color-converter">Color Converter</Link>, or browse the rest
          of the <Link to="/category/graphics-media">Graphics &amp; Media tools</Link> on Rootconverter.
        </p>
      </article>
    </div>
  );
}
