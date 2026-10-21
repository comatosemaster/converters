import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePasteToUpload } from '../../hooks/usePasteToUpload.js';
import { describePayload, scanFrame, scanImage } from './qrScanUtils.js';

// How often the live camera image is checked. Faster than this mostly
// burns battery - a QR code held up to a camera stays in view for a while.
const FRAME_INTERVAL_MS = 150;

const MAX_FILE_SIZE = 30 * 1024 * 1024;

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function QrCodeScanner() {
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(0);

  const [mode, setMode] = useState('image'); // 'image' | 'camera'
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [preview, setPreview] = useState(null); // { image, width, height, corners }
  const [cameraState, setCameraState] = useState('off'); // 'off' | 'starting' | 'live'
  const [result, setResult] = useState(null); // decoded text
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // --- Camera ---------------------------------------------------------------

  function stopCamera() {
    clearTimeout(loopRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState('off');
  }

  // Never leave the camera (and its "in use" light) on after leaving the page.
  useEffect(() => stopCamera, []);

  async function startCamera() {
    setError('');
    setResult(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser can’t use the camera here. Try uploading a photo of the QR code instead.');
      return;
    }
    setCameraState('starting');
    try {
      // Prefer the back camera on phones; laptops just use their webcam.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      setCameraState('live');
      const tick = async () => {
        if (!streamRef.current) return;
        if (video.readyState >= 2 && video.videoWidth) {
          const text = await scanFrame(video);
          if (text) {
            setResult(text);
            stopCamera();
            return;
          }
        }
        loopRef.current = setTimeout(tick, FRAME_INTERVAL_MS);
      };
      tick();
    } catch (cameraError) {
      stopCamera();
      setError(
        cameraError?.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera in your browser’s site settings, or upload a photo instead.'
          : cameraError?.name === 'NotFoundError'
            ? 'No camera was found on this device. Upload a photo of the QR code instead.'
            : 'The camera couldn’t be started. It may be in use by another app.',
      );
    }
  }

  function switchMode(next) {
    if (next === mode) return;
    stopCamera();
    setMode(next);
    setResult(null);
    setError('');
  }

  // --- Images ---------------------------------------------------------------

  async function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(file.name)) {
      setError('Please choose an image file (a photo or screenshot of the QR code).');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('That image is too large (over 30 MB).');
      return;
    }
    stopCamera();
    setMode('image');
    setError('');
    setResult(null);
    setIsScanning(true);
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      const found = await scanImage(image, width, height);
      setPreview({ image, width, height, corners: found?.corners ?? null });
      if (found) setResult(found.text);
      else
        setError(
          'No QR code found in this image. Make sure the whole code is visible, in focus, and not too small - cropping the photo closer to the code often helps.',
        );
    } catch {
      setError('This image couldn’t be read. Try a PNG or JPG.');
      setPreview(null);
    } finally {
      URL.revokeObjectURL(url);
      setIsScanning(false);
    }
  }

  usePasteToUpload(true, handleFile);

  // Draw the scanned image with the found code outlined, so it's obvious
  // which code was read (and that it was found at all).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !preview) return;
    const scale = Math.min(1, 900 / Math.max(preview.width, preview.height));
    canvas.width = Math.round(preview.width * scale);
    canvas.height = Math.round(preview.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(preview.image, 0, 0, canvas.width, canvas.height);
    if (preview.corners) {
      ctx.lineWidth = Math.max(3, canvas.width / 150);
      ctx.strokeStyle = '#22c55e';
      ctx.beginPath();
      preview.corners.forEach((p, i) => (i ? ctx.lineTo(p.x * scale, p.y * scale) : ctx.moveTo(p.x * scale, p.y * scale)));
      ctx.closePath();
      ctx.stroke();
    }
  }, [preview, mode]);

  async function handleCopy() {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const info = result ? describePayload(result) : null;

  return (
    <div className="qr-code-scanner">
      <div className="mode-toggle" role="radiogroup" aria-label="Scan from">
        {[
          ['image', 'Upload image'],
          ['camera', 'Use camera'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={mode === id}
            className={mode === id ? 'mode-button active' : 'mode-button'}
            onClick={() => switchMode(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'image' ? (
        <>
          <div
            className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
            role="button"
            tabIndex={0}
            aria-label="Drag and drop, paste, or click to choose an image with a QR code"
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
            <p className="drop-zone-title">{isScanning ? 'Scanning…' : 'Drag & drop, paste, or click to browse'}</p>
            <p className="drop-zone-hint">A screenshot or photo containing a QR code</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="visually-hidden"
              aria-label="Choose an image with a QR code"
              onChange={(event) => {
                handleFile(event.target.files[0]);
                event.target.value = '';
              }}
            />
          </div>
          {preview && (
            <div className="qr-scan-preview">
              <canvas ref={canvasRef} aria-label="The scanned image, with the QR code outlined" />
            </div>
          )}
        </>
      ) : (
        <div className="qr-camera">
          <div className={cameraState === 'live' ? 'qr-camera-frame live' : 'qr-camera-frame'}>
            <video ref={videoRef} muted playsInline aria-label="Camera view" />
            {cameraState !== 'live' && (
              <div className="qr-camera-placeholder">
                {cameraState === 'starting' ? 'Starting camera…' : result ? 'Code scanned' : 'Camera is off'}
              </div>
            )}
            {cameraState === 'live' && <div className="qr-camera-target" aria-hidden="true" />}
          </div>
          <div className="converter-toolbar">
            {cameraState === 'off' ? (
              <button type="button" className="btn btn-primary" onClick={startCamera}>
                {result ? 'Scan another code' : 'Start camera'}
              </button>
            ) : (
              <button type="button" className="ghost-button" onClick={stopCamera}>
                Stop camera
              </button>
            )}
          </div>
          {cameraState === 'live' && <p className="field-hint">Point the camera at a QR code - it&apos;s read automatically.</p>}
        </div>
      )}

      {error && <p className="field-error">{error}</p>}

      {info && (
        <section className="qr-result" aria-live="polite">
          <div className="field-header">
            <h2 className="qr-result-type">{info.label}</h2>
            <button type="button" className="copy-button" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy text'}
            </button>
          </div>
          {info.fields.length > 0 && (
            <dl className="comparison-meta qr-result-fields">
              {info.fields.map(([name, value]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <pre className="qr-result-raw">{result}</pre>
          {info.action && (
            <>
              <a className="download-button" href={info.action.href} target="_blank" rel="noopener noreferrer">
                {info.action.label}
              </a>
              {info.type === 'url' && (
                <p className="field-hint">
                  Check the address above before opening - QR codes are a common way to disguise
                  phishing links.
                </p>
              )}
            </>
          )}
        </section>
      )}

      <article className="tool-article">
        <p>
          This QR code scanner reads QR codes from a screenshot, a photo, or your camera - right in
          the browser, without installing an app. The image never leaves your device, which matters
          when the code holds a WiFi password or contact details.
        </p>

        <h2>How to scan a QR code</h2>
        <ul>
          <li><strong>From an image:</strong> drop a screenshot or photo into the box, paste it with Ctrl+V / Cmd+V, or click to choose a file. The code is outlined in green when found.</li>
          <li><strong>With your camera:</strong> switch to <strong>Use camera</strong>, allow access, and hold the code in view. It&apos;s read automatically, and the camera turns off as soon as it is.</li>
        </ul>

        <h2>What it understands</h2>
        <p>
          Besides plain text, the scanner recognizes the common QR code formats and lays them out
          clearly: website links (showing the real destination before you open it), WiFi networks
          with their password, email and text messages, phone numbers, contact cards (vCard), map
          locations and calendar events.
        </p>

        <h2>If a code won&apos;t scan</h2>
        <ul>
          <li>Crop the photo closer to the code, or move the camera nearer so the code fills more of the frame.</li>
          <li>Avoid glare and blur - hold steady, and make sure the code is in focus.</li>
          <li>Keep the white border (quiet zone) around the code visible; codes cut off at the edge can&apos;t be read.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Is it safe to open links from QR codes?</h3>
          <p>Only if you trust where they lead. This scanner never opens links by itself - it shows the destination website first so you can spot look-alike or unexpected addresses.</p>
        </div>
        <div className="faq-item">
          <h3>Are my images or camera feed uploaded?</h3>
          <p>No. Decoding runs entirely in your browser, and the camera is only used while the scanner is open and running.</p>
        </div>
        <div className="faq-item">
          <h3>Can it read barcodes too?</h3>
          <p>This tool reads QR codes only. Product barcodes (EAN/UPC) and other 2D codes like Data Matrix use different formats.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Make your own with the <Link to="/tool/qr-code-generator">QR Code Generator</Link>, pull
          text out of images with <Link to="/tool/image-to-text">Image to Text</Link>, or browse all{' '}
          <Link to="/category/graphics-media">Graphics &amp; Media tools</Link>.
        </p>
      </article>
    </div>
  );
}
