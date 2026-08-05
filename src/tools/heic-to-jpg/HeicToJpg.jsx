import { useEffect, useRef, useState } from 'react';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

// --- Helpers -----------------------------------------------------------------

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// HEIC files are notoriously inconsistent about their reported MIME type —
// many browsers/OSes report an empty string instead of "image/heic". So we
// check the file extension too, not just file.type.
function isHeicFile(file) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.heic') ||
    name.endsWith('.heif') ||
    file.type === 'image/heic' ||
    file.type === 'image/heif'
  );
}

function buildDownloadName(originalName) {
  const base = originalName.replace(/\.[^./]+$/, ''); // strip .heic/.heif
  return `${base}.jpg`;
}

// --- The tool component -------------------------------------------------------
//
// Unlike the other image tools, this one handles a LIST of files at once —
// HEIC conversion is a one-shot batch job people run on a whole camera roll
// export, not a single image to tweak interactively. Each file gets its own
// little card tracking whether it's still converting, done, or failed.
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> — the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function HeicToJpg() {
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [quality, setQuality] = useState(0.9);
  const [items, setItems] = useState([]); // { id, file, status, outputBlob, outputUrl, error, downloaded }
  const [globalError, setGlobalError] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Keeps a live copy of `items` for the unmount cleanup below, without
  // making that effect re-run (and re-attach) every time items changes.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Revoke every converted image's object URL when the tool is closed, so
  // we don't leak memory after converting a big batch of photos.
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => {
        if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
      });
    };
  }, []);

  // Runs the actual HEIC -> JPEG decode for one file, then updates just
  // that file's card with the result. Each file converts independently, so
  // one failure doesn't hold up the others.
  async function convertItem(id, file, qualityAtStart) {
    try {
      // heic2any bundles a large WASM decoder (over a megabyte). Importing
      // it dynamically, right when we actually need it, keeps that weight
      // out of the main site bundle — everyone else's page stays fast, and
      // only someone actually converting a HEIC photo downloads it.
      const { default: heic2any } = await import('heic2any');
      const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: qualityAtStart });
      // Some HEIC files (e.g. iPhone "Live Photos") bundle more than one
      // image — heic2any returns an array in that case. We only want the
      // main photo, which is always the first one.
      const blob = Array.isArray(result) ? result[0] : result;
      const url = URL.createObjectURL(blob);
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: 'done', outputBlob: blob, outputUrl: url } : item,
        ),
      );
    } catch {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, status: 'error', error: "Couldn't convert this file — it may be corrupted or not a real HEIC/HEIF image." }
            : item,
        ),
      );
    }
  }

  function handleFiles(fileList) {
    const files = Array.from(fileList);
    const heicFiles = files.filter(isHeicFile);
    const skipped = files.length - heicFiles.length;

    setGlobalError(
      skipped > 0 ? `Skipped ${skipped} file(s) — only .heic/.heif photos are supported.` : '',
    );

    const newItems = heicFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: 'converting',
      outputBlob: null,
      outputUrl: '',
      error: '',
      downloaded: false,
    }));
    setItems((prev) => [...prev, ...newItems]);

    // Kick off every conversion right away — they run independently, so
    // the UI updates each card as soon as its own decode finishes instead
    // of waiting for the whole batch.
    newItems.forEach((item) => convertItem(item.id, item.file, quality));
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  }

  function removeItem(id) {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.outputUrl) URL.revokeObjectURL(target.outputUrl);
      return prev.filter((item) => item.id !== id);
    });
  }

  function clearAll() {
    items.forEach((item) => {
      if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
    });
    setItems([]);
    setGlobalError('');
  }

  // "Clear all" throws away every photo in the list — if any are still
  // converting or not yet downloaded, confirm first. (This doesn't
  // navigate anywhere, so UnsavedChangesGuard can't catch it on its own —
  // it only watches for page-to-page navigation.)
  function handleClearAllClick() {
    if (hasUnsavedWork) {
      setShowClearConfirm(true);
    } else {
      clearAll();
    }
  }

  function markDownloaded(id) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, downloaded: true } : item)));
  }

  // "Unsaved work" means: at least one photo is still converting, or has
  // finished but hasn't been downloaded yet. An empty list, or a list
  // where everything is either downloaded or errored out, needs no warning.
  const hasUnsavedWork = items.some((item) => item.status !== 'error' && !item.downloaded);
  useUnsavedChangesWarning(hasUnsavedWork);

  return (
    <div className="heic-converter">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      <div className="field">
        <label htmlFor="quality">Output quality: {Math.round(quality * 100)}%</label>
        <input
          id="quality"
          type="range"
          min="0.1"
          max="1"
          step="0.01"
          value={quality}
          onChange={(event) => setQuality(Number(event.target.value))}
        />
        <p className="field-hint">
          Applies to photos converted from now on. Note: converting doesn't preserve the
          original's rotation info, so an occasional photo may come out sideways.
        </p>
      </div>

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
        <p className="drop-zone-title">Drag & drop HEIC/HEIF photos here, or click to browse</p>
        <p className="drop-zone-hint">You can select more than one at a time</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".heic,.heif,image/heic,image/heif"
          multiple
          className="visually-hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>

      {globalError && <p className="field-error">{globalError}</p>}

      {items.length > 0 && (
        <>
          <div className="converter-toolbar">
            <button type="button" className="ghost-button" onClick={handleClearAllClick}>
              Clear all
            </button>
          </div>

          {showClearConfirm && (
            <ConfirmDialog
              title="Clear all photos?"
              message="Some photos are still converting or haven't been downloaded yet. Clearing the list will discard them."
              confirmLabel="Clear anyway"
              onCancel={() => setShowClearConfirm(false)}
              onConfirm={() => {
                setShowClearConfirm(false);
                clearAll();
              }}
            />
          )}

          <div className="tool-grid">
            {items.map((item) => (
              <div key={item.id} className="heic-item">
                <div className="heic-item-header">
                  <span className="heic-item-name" title={item.file.name}>
                    {item.file.name}
                  </span>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Remove ${item.file.name}`}
                  >
                    &times;
                  </button>
                </div>

                {item.status === 'converting' && (
                  <p className="category-empty">Converting…</p>
                )}

                {item.status === 'error' && <p className="field-error">{item.error}</p>}

                {item.status === 'done' && (
                  <>
                    <div className="comparison-image-frame">
                      <img src={item.outputUrl} alt="" className="comparison-image" />
                    </div>
                    <p className="field-hint">
                      {formatBytes(item.file.size)} HEIC &rarr; {formatBytes(item.outputBlob.size)} JPG
                    </p>
                    <a
                      className="download-button"
                      href={item.outputUrl}
                      download={buildDownloadName(item.file.name)}
                      onClick={() => markDownloaded(item.id)}
                    >
                      Download JPG
                    </a>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
