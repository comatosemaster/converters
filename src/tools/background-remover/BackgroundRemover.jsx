import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { usePasteToUpload } from '../../hooks/usePasteToUpload.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { validateImageDimensions, validateImageFile } from '../image-flipper/imageFlipUtils.js';
import { canvasToBlob } from '../image-rotator/rotateUtils.js';
import { MODEL_SIZES_MB, composeCutout, cutoutName, predictMask } from './backgroundRemovalUtils.js';

const BACKGROUNDS = [
  { id: 'transparent', label: 'Transparent', color: null },
  { id: 'white', label: 'White', color: '#ffffff' },
  { id: 'black', label: 'Black', color: '#000000' },
  { id: 'custom', label: 'Color', color: null },
];

const OUTPUTS = [
  { mime: 'image/png', label: 'PNG', extension: 'png' },
  { mime: 'image/jpeg', label: 'JPG', extension: 'jpg' },
  { mime: 'image/webp', label: 'WebP', extension: 'webp' },
];

function decode(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image file.'));
    };
    img.src = url;
  });
}

function describeProgress(progress) {
  if (!progress) return '';
  if (progress.phase === 'fallback') return "Your graphics card couldn't run the model - switching to your processor…";
  if (progress.phase === 'model') {
    if (progress.cached) return 'Loading the AI model from this device…';
    if (!progress.total) return 'Downloading the AI model (one time)…';
    const mb = (n) => (n / (1024 * 1024)).toFixed(1);
    return `Downloading the AI model (one time): ${mb(progress.loaded)} of ${mb(progress.total)} MB`;
  }
  if (progress.phase === 'init') return 'Starting the AI model…';
  if (progress.phase === 'run') {
    return progress.device === 'wasm'
      ? 'Removing the background on your processor - this can take 5 to 20 seconds…'
      : 'Removing the background on your graphics card…';
  }
  return 'Getting ready…';
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// The AI model, its download and the image maths live in
// backgroundRemovalUtils.js; the before/after slider reuses the Watermark
// Remover's compare styles.

export default function BackgroundRemover() {
  const fileInputRef = useRef(null);
  const runIdRef = useRef(0);

  const [image, setImage] = useState(null); // { file, img, url }
  const [mask, setMask] = useState(null); // canvas
  const [cutoutUrl, setCutoutUrl] = useState('');
  const [progress, setProgress] = useState(null);
  const [device, setDevice] = useState(null);
  const [elapsed, setElapsed] = useState(null);
  const [error, setError] = useState('');
  const [background, setBackground] = useState('transparent');
  const [customColor, setCustomColor] = useState('#5b3df5');
  const [mime, setMime] = useState('image/png');
  const [compare, setCompare] = useState(100);
  const [isDragging, setIsDragging] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);

  const isWorking = Boolean(image) && !mask && !error;
  const hasUnsavedWork = Boolean(mask) && !downloaded;
  useUnsavedChangesWarning(hasUnsavedWork || isWorking);

  const bgColor = background === 'custom' ? customColor : BACKGROUNDS.find((b) => b.id === background).color;
  const output = OUTPUTS.find((o) => o.mime === mime);

  useEffect(() => setDownloaded(false), [mask, background, customColor, mime]);
  useEffect(() => () => image && URL.revokeObjectURL(image.url), [image]);
  useEffect(() => () => cutoutUrl && URL.revokeObjectURL(cutoutUrl), [cutoutUrl]);

  const run = useCallback(async (img) => {
    const runId = ++runIdRef.current;
    setMask(null);
    setCutoutUrl('');
    setError('');
    setProgress({ phase: 'start' });
    let runStarted = performance.now();
    try {
      const { mask: nextMask, device: usedDevice } = await predictMask(img, (p) => {
        if (runId !== runIdRef.current) return;
        // Timing starts once the model is ready, so it reflects the
        // removal itself rather than the one-time download.
        if (p.phase === 'run') runStarted = performance.now();
        setProgress(p);
      });
      if (runId !== runIdRef.current) return;
      setDevice(usedDevice);
      // A transparent PNG of the cutout for the preview; the download is
      // composed fresh with whatever background is chosen.
      const blob = await canvasToBlob(composeCutout(img, nextMask, null), 'image/png');
      if (runId !== runIdRef.current) return;
      setCutoutUrl(URL.createObjectURL(blob));
      setMask(nextMask);
      setCompare(100);
      setElapsed((performance.now() - runStarted) / 1000);
    } catch (runError) {
      if (runId !== runIdRef.current) return;
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const message = runError?.message ?? '';
      setError(
        offline
          ? "You're offline, and the AI model hasn't been downloaded on this device yet. Connect to the internet and try again."
          : /failed to fetch|networkerror|load failed|couldn't be downloaded/i.test(message)
            ? "The AI model couldn't be downloaded. Check your internet connection, then press Try again."
          : message.includes('memory')
            ? 'Your device ran out of memory for this image. Try a smaller image, or close other tabs.'
            : `Something went wrong: ${runError?.message || 'the AI model could not run in this browser.'}`,
      );
    } finally {
      if (runId === runIdRef.current) setProgress(null);
    }
  }, []);

  const loadFile = useCallback(
    async (file) => {
      const check = validateImageFile(file);
      if (!check.ok) {
        setError(check.error);
        return;
      }
      try {
        const decoded = await decode(file);
        const dims = validateImageDimensions(decoded.img.naturalWidth, decoded.img.naturalHeight);
        if (!dims.ok) {
          URL.revokeObjectURL(decoded.url);
          setError(dims.error);
          return;
        }
        setImage({ file, ...decoded });
        setMime('image/png');
        run(decoded.img);
      } catch (decodeError) {
        setError(decodeError.message);
      }
    },
    [run],
  );

  const requestFile = useCallback(
    (file) => {
      if (!file) return;
      if (hasUnsavedWork || isWorking) setPendingFile(file);
      else loadFile(file);
    },
    [hasUnsavedWork, isWorking, loadFile],
  );
  usePasteToUpload(true, requestFile);

  async function handleDownload() {
    // JPG has no transparency - fall back to white rather than black.
    const fill = bgColor ?? (mime === 'image/jpeg' ? '#ffffff' : null);
    const blob = await canvasToBlob(composeCutout(image.img, mask, fill), mime);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = cutoutName(image.file.name, output.extension);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloaded(true);
  }

  // Exactly the photo's proportions, no taller than 70% of the screen, so
  // the before/after halves line up with no empty bands.
  const stageStyle = image
    ? {
        aspectRatio: `${image.img.naturalWidth} / ${image.img.naturalHeight}`,
        width: `min(100%, calc(70vh * ${image.img.naturalWidth / image.img.naturalHeight}))`,
      }
    : undefined;

  return (
    <div className="background-remover">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork || isWorking} />
      {pendingFile && (
        <ConfirmDialog
          title="Open a different image?"
          message={isWorking ? 'The current image is still being processed.' : "You haven't downloaded this result yet. Opening another image replaces it."}
          confirmLabel="Open image"
          onCancel={() => setPendingFile(null)}
          onConfirm={() => {
            loadFile(pendingFile);
            setPendingFile(null);
          }}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="visually-hidden"
        aria-label="Choose an image"
        onChange={(event) => {
          requestFile(event.target.files[0]);
          event.target.value = '';
        }}
      />

      {!image && (
        <>
          <div
            className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
            role="button"
            tabIndex={0}
            aria-label="Drag and drop, paste, or click to choose a photo"
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
            <p className="drop-zone-title">Drag &amp; drop, paste, or click to choose a photo</p>
            <p className="drop-zone-hint">People, products, pets, cars - PNG, JPG or WebP</p>
          </div>
          <p className="field-hint">
            The first time, your browser downloads an AI model ({MODEL_SIZES_MB[0]}-{MODEL_SIZES_MB[1]} MB, depending on
            your device). It&apos;s kept on this device, so later photos start right away. Your photos are
            never uploaded.
          </p>
        </>
      )}

      {error && (
        <div className="field-error" role="alert">
          <span>{error}</span>
          {image && (
            <button type="button" className="ghost-button btn-sm" onClick={() => run(image.img)}>
              Try again
            </button>
          )}
        </div>
      )}

      {image && (
        <div className="filters-layout">
          <div className="filters-preview">
            <div className="watermark-compare bg-remove-stage" style={stageStyle}>
              {cutoutUrl ? (
                <>
                  <img src={image.url} alt="Original photo" className="watermark-compare-image" />
                  <div
                    className="watermark-compare-image bg-remove-result"
                    style={{ clipPath: `inset(0 ${100 - compare}% 0 0)`, backgroundColor: bgColor ?? 'transparent' }}
                  >
                    <img src={cutoutUrl} alt="Photo with the background removed" />
                  </div>
                  <div className="watermark-compare-handle" style={{ left: `${compare}%` }} />
                </>
              ) : (
                <>
                  <img src={image.url} alt="Your photo" className="watermark-compare-image bg-remove-pending" />
                  {isWorking && (
                    <div className="bg-remove-status" aria-live="polite">
                      <span className="bg-remove-spinner" aria-hidden="true" />
                      <p>{describeProgress(progress)}</p>
                      {progress?.phase === 'model' && progress.total > 0 && (
                        <progress value={progress.loaded} max={progress.total} />
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            {cutoutUrl && (
              <input
                type="range"
                className="watermark-compare-slider"
                min={0}
                max={100}
                value={compare}
                aria-label="Compare the original and the result"
                onChange={(event) => setCompare(Number(event.target.value))}
              />
            )}
            <div className="converter-toolbar json-toolbar">
              <button type="button" className="ghost-button" onClick={() => fileInputRef.current?.click()}>
                Choose a different photo
              </button>
              {elapsed && (
                <span className="field-hint">
                  Done in {elapsed.toFixed(1)} s on your {device === 'webgpu' ? 'graphics card' : 'processor'}
                </span>
              )}
            </div>
          </div>

          <div className="filters-controls">
            <div className="field">
              <span className="filters-label">Background</span>
              <div className="mode-toggle" role="radiogroup" aria-label="New background">
                {BACKGROUNDS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    role="radio"
                    aria-checked={background === b.id}
                    className={background === b.id ? 'mode-button active' : 'mode-button'}
                    onClick={() => {
                      setBackground(b.id);
                      if (b.id === 'transparent' && mime === 'image/jpeg') setMime('image/png');
                    }}
                    disabled={!mask}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
            {background === 'custom' && (
              <div className="field">
                <label htmlFor="bg-remove-color">Background color</label>
                <input id="bg-remove-color" type="color" className="color-picker" value={customColor} onChange={(event) => setCustomColor(event.target.value)} />
              </div>
            )}
            <div className="field">
              <label htmlFor="bg-remove-format">Save as</label>
              <select id="bg-remove-format" value={mime} onChange={(event) => setMime(event.target.value)} disabled={!mask}>
                {OUTPUTS.map((o) => (
                  <option key={o.mime} value={o.mime}>
                    {o.label}
                    {o.mime === 'image/jpeg' && !bgColor ? ' (white background)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-primary btn-lg bg-remove-download" onClick={handleDownload} disabled={!mask}>
              Download image
            </button>
            <p className="field-hint">
              {mask
                ? `Full resolution, ${image.img.naturalWidth}×${image.img.naturalHeight} px. Drag the slider under the image to compare with the original.`
                : 'The result appears here when the AI model finishes.'}
            </p>
          </div>
        </div>
      )}

      <article className="tool-article">
        <p>
          Remove the background from a photo automatically - for product shots, profile
          pictures, stickers, slides and design mockups. An AI model finds the main subject and
          makes everything else transparent, or replaces it with a color you choose. It runs
          entirely in your browser, so your photos are never uploaded to anyone&apos;s server.
        </p>

        <h2>How to remove a background</h2>
        <ol>
          <li>Drop, paste or choose a photo. The background is removed automatically.</li>
          <li>Drag the slider to compare with the original.</li>
          <li>Keep the background transparent, or pick white, black or any color.</li>
          <li>Download as PNG (keeps transparency), JPG or WebP at full resolution.</li>
        </ol>

        <h2>How it works</h2>
        <p>
          The tool uses <strong>ISNet</strong>, an image segmentation model from the open-source
          DIS project, which was trained to separate a main subject from its surroundings with
          fine detail such as hair and edges. It runs on your graphics card through WebGPU where
          your browser supports it (current Chrome, Edge and Safari), which takes about a second;
          otherwise it runs on your processor, which takes longer. The model file is downloaded
          once - {MODEL_SIZES_MB[1]} MB for graphics cards, {MODEL_SIZES_MB[0]} MB for processors - and stored on your device for next time.
        </p>

        <h2>Tips for the best result</h2>
        <ul>
          <li>Photos with one clear subject work best: a person, a product, an animal or a car.</li>
          <li>Good contrast between subject and background helps - a dark coat against a dark wall is harder.</li>
          <li>Busy group photos, see-through objects such as glass, and fine details like wisps of hair against a busy background may need a touch-up in an image editor.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Are my photos uploaded?</h3>
          <p>No. Only the AI model is downloaded to your browser; your photos are processed on your own device and never sent anywhere.</p>
        </div>
        <div className="faq-item">
          <h3>Is there a limit or a watermark?</h3>
          <p>No limits, no sign-up and no watermark. Results are full resolution.</p>
        </div>
        <div className="faq-item">
          <h3>Does it work offline?</h3>
          <p>After the first use, yes - the model is stored on your device, so you can remove backgrounds without an internet connection.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Resize or crop the result with the <Link to="/tool/image-resizer">Image Resizer &amp; Cropper</Link>,
          shrink it with the <Link to="/tool/image-compressor">Image Compressor</Link>, or browse
          all <Link to="/category/graphics-media">Graphics &amp; Media tools</Link>.
        </p>
      </article>
    </div>
  );
}
