import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { usePasteToUpload } from '../../hooks/usePasteToUpload.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';
import {
  MAX_FILE_SIZE,
  allTags,
  cleanedName,
  detectFormat,
  readMetadata,
  stripMetadata,
  summarize,
} from './exifUtils.js';

let nextId = 1;

// Tags that stay on purpose after cleaning (see stripMetadata).
const KEPT_TAGS = new Set(['Orientation']);

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.

export default function ExifRemover() {
  const fileInputRef = useRef(null);
  // { id, file, bytes, format, meta, summary, expanded, showAll, result }
  // result: { blob, url, removed, removedBytes, verified }
  const [items, setItems] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [keepColorProfile, setKeepColorProfile] = useState(true);
  const [isCleaning, setIsCleaning] = useState(false);
  const [zipUrl, setZipUrl] = useState('');
  const [zipDownloaded, setZipDownloaded] = useState(false);
  const [errors, setErrors] = useState([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Release object URLs when leaving the page.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(
    () => () => {
      itemsRef.current.forEach((item) => item.result && URL.revokeObjectURL(item.result.url));
    },
    [],
  );

  // Changing the color-profile option makes cleaned files stale.
  useEffect(() => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.result) URL.revokeObjectURL(item.result.url);
        return { ...item, result: null, downloaded: false };
      }),
    );
    setZipUrl('');
  }, [keepColorProfile]);

  async function handleFiles(fileList) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setIsReading(true);
    const added = [];
    const problems = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        problems.push(`${file.name}: too large (over 100 MB).`);
        continue;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const meta = await readMetadata(bytes);
      added.push({
        id: nextId++,
        file,
        bytes,
        format: detectFormat(bytes),
        meta,
        summary: summarize(meta),
        expanded: files.length === 1,
        showAll: false,
        result: null,
        downloaded: false,
      });
    }
    setItems((prev) => [...prev, ...added]);
    setErrors(problems);
    setZipUrl('');
    setIsReading(false);
  }

  usePasteToUpload(true, (file) => handleFiles([file]));

  function update(id, changes) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  async function handleCleanAll() {
    setIsCleaning(true);
    const next = [];
    for (const item of items) {
      if (!item.format || item.result) {
        next.push(item);
        continue;
      }
      try {
        const { blob, removed, removedBytes } = stripMetadata(item.bytes, {
          keepColorProfile,
          orientation: item.summary.orientation,
        });
        // Re-read the cleaned file to prove nothing personal is left.
        const after = await readMetadata(new Uint8Array(await blob.arrayBuffer()));
        const left = Object.keys(after).filter((key) => !KEPT_TAGS.has(key));
        next.push({
          ...item,
          result: { blob, url: URL.createObjectURL(blob), removed, removedBytes, verified: left.length === 0, left },
        });
      } catch (cleanError) {
        next.push({ ...item, cleanError: cleanError.message });
      }
    }
    setItems(next);
    setIsCleaning(false);
  }

  async function handleZip() {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const used = new Set();
    for (const item of items) {
      if (!item.result) continue;
      let name = cleanedName(item.file.name);
      for (let n = 2; used.has(name); n++) name = cleanedName(item.file.name).replace(/(\.[^.]+)?$/, `-${n}$1`);
      used.add(name);
      zip.file(name, item.result.blob);
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    setZipUrl(URL.createObjectURL(blob));
  }

  const removable = items.filter((item) => item.format);
  const cleaned = items.filter((item) => item.result);
  const pending = removable.filter((item) => !item.result);
  const hasUnsavedWork = items.length > 0 && !zipDownloaded && removable.some((item) => !item.downloaded);
  useUnsavedChangesWarning(hasUnsavedWork);

  function clearAll() {
    items.forEach((item) => item.result && URL.revokeObjectURL(item.result.url));
    setItems([]);
    setZipUrl('');
    setZipDownloaded(false);
    setErrors([]);
  }

  return (
    <div className="exif-remover">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />
      {showClearConfirm && (
        <ConfirmDialog
          title="Remove all photos?"
          message="You haven't downloaded every cleaned photo yet. Clearing removes them from the list."
          confirmLabel="Discard and clear"
          onCancel={() => setShowClearConfirm(false)}
          onConfirm={() => {
            setShowClearConfirm(false);
            clearAll();
          }}
        />
      )}

      <div
        className={isDragging ? 'drop-zone dragging' : 'drop-zone'}
        role="button"
        tabIndex={0}
        aria-label="Drag and drop, paste, or click to choose photos to inspect"
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
          handleFiles(event.dataTransfer.files);
        }}
      >
        <p className="drop-zone-title">{isReading ? 'Reading metadata…' : items.length ? 'Add more photos' : 'Drag & drop, paste, or click to browse'}</p>
        <p className="drop-zone-hint">See what your photos reveal - location, camera, date - and remove it</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="visually-hidden"
          aria-label="Choose photos"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {errors.length > 0 && (
        <div className="field-error">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <>
          <ul className="exif-list">
            {items.map((item) => {
              const { summary } = item;
              const hasPersonal = summary.rows.length > 0 || summary.gps;
              return (
                <li key={item.id} className="exif-item">
                  <div className="exif-item-header">
                    <div className="pdf-image-info">
                      <p className="pdf-image-name">{item.file.name}</p>
                      <p className="pdf-image-meta">
                        {formatBytes(item.file.size)} &middot; {summary.tagCount} metadata field{summary.tagCount === 1 ? '' : 's'}
                      </p>
                      <div className="exif-badges">
                        {summary.gps && <span className="exif-badge exif-badge-danger">📍 Location</span>}
                        {summary.rows.some(([k]) => k === 'Camera') && <span className="exif-badge">Camera info</span>}
                        {summary.rows.some(([k]) => k === 'Taken') && <span className="exif-badge">Date taken</span>}
                        {!hasPersonal && summary.tagCount === 0 && <span className="exif-badge exif-badge-ok">No metadata found</span>}
                        {item.result && (
                          <span className={item.result.verified ? 'exif-badge exif-badge-ok' : 'exif-badge exif-badge-danger'}>
                            {item.result.verified ? '✓ Cleaned & verified' : `${item.result.left.length} fields remain`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="case-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        aria-expanded={item.expanded}
                        onClick={() => update(item.id, { expanded: !item.expanded })}
                      >
                        {item.expanded ? 'Hide' : 'Details'}
                      </button>
                      {item.result && (
                        <a
                          className="copy-button"
                          href={item.result.url}
                          download={cleanedName(item.file.name)}
                          onClick={() => update(item.id, { downloaded: true })}
                        >
                          Download
                        </a>
                      )}
                    </div>
                  </div>

                  {item.expanded && (
                    <div className="exif-details">
                      {summary.gps && (
                        <div className="exif-gps">
                          <strong>This photo contains its GPS location.</strong> Anyone you send it to can see where it
                          was taken: {summary.gps.latitude.toFixed(5)}, {summary.gps.longitude.toFixed(5)}{' '}
                          <a
                            href={`https://www.openstreetmap.org/?mlat=${summary.gps.latitude}&mlon=${summary.gps.longitude}#map=17/${summary.gps.latitude}/${summary.gps.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View on map
                          </a>
                        </div>
                      )}
                      {summary.rows.length > 0 && (
                        <dl className="comparison-meta">
                          {summary.rows.map(([k, v]) => (
                            <div key={k}>
                              <dt>{k}</dt>
                              <dd>{v}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {!item.format && (
                        <p className="field-hint">
                          Removing metadata works for JPG, PNG and WebP. For iPhone HEIC photos, convert them with{' '}
                          <Link to="/tool/heic-to-jpg">HEIC to JPG</Link> first - the converted file has no metadata.
                        </p>
                      )}
                      {item.result && (
                        <p className="field-hint">
                          Removed: {item.result.removed.length ? item.result.removed.join(', ') : 'nothing needed removing'} (
                          {formatBytes(item.result.removedBytes)}).
                          {item.summary.orientation > 1 && ' The rotation flag was kept so the photo still displays the right way up.'}
                        </p>
                      )}
                      {item.cleanError && <p className="field-error">{item.cleanError}</p>}
                      {summary.tagCount > 0 && (
                        <>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => update(item.id, { showAll: !item.showAll })}
                          >
                            {item.showAll ? 'Hide all fields' : `Show all ${summary.tagCount} fields`}
                          </button>
                          {item.showAll && (
                            <dl className="comparison-meta exif-all">
                              {allTags(item.meta).map(([k, v]) => (
                                <div key={k}>
                                  <dt>{k}</dt>
                                  <dd>{v}</dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <label className="checkbox-field">
            <input type="checkbox" checked={keepColorProfile} onChange={(event) => setKeepColorProfile(event.target.checked)} />
            Keep color profile (recommended - it contains no personal data, and removing it can change colors)
          </label>

          <div className="converter-toolbar">
            {pending.length > 0 && (
              <button type="button" className="download-button" onClick={handleCleanAll} disabled={isCleaning}>
                {isCleaning ? 'Removing…' : `Remove metadata from ${pending.length} photo${pending.length === 1 ? '' : 's'}`}
              </button>
            )}
            {cleaned.length > 1 &&
              (zipUrl ? (
                <a className="download-button" href={zipUrl} download="cleaned-photos.zip" onClick={() => setZipDownloaded(true)}>
                  Download all as ZIP
                </a>
              ) : (
                <button type="button" className="download-button" onClick={handleZip}>
                  Download all {cleaned.length} as ZIP
                </button>
              ))}
            <button type="button" className="ghost-button" onClick={() => (hasUnsavedWork ? setShowClearConfirm(true) : clearAll())}>
              Clear all
            </button>
          </div>
        </>
      )}

      <article className="tool-article">
        <p>
          Photos carry hidden information called metadata (EXIF): the camera or phone model, the exact
          date and time, camera settings, sometimes your name - and often the GPS coordinates of where
          the picture was taken. This tool shows you everything a photo reveals and removes it, right in
          your browser, so the photo itself never leaves your device.
        </p>

        <h2>How to remove metadata from photos</h2>
        <ol>
          <li>Drop one or more photos (JPG, PNG, or WebP) into the box, or paste them.</li>
          <li>Check what each one contains - a red 📍 Location badge means the photo reveals where it was taken.</li>
          <li>Click <strong>Remove metadata</strong>, then download the cleaned photos one by one or as a ZIP.</li>
        </ol>

        <h2>No quality loss</h2>
        <p>
          Most tools &quot;remove&quot; metadata by re-saving the photo, which re-compresses it and
          slightly reduces quality. This one cuts the metadata out of the file directly, leaving the
          image data byte-for-byte identical. Each cleaned photo is then read again to verify that
          nothing personal was left behind.
        </p>

        <h2>What&apos;s kept, and why</h2>
        <ul>
          <li><strong>Orientation</strong> - phones often store photos sideways with a flag saying &quot;display rotated&quot;. That one flag is kept (and nothing else), so your photo doesn&apos;t suddenly appear sideways.</li>
          <li><strong>Color profile</strong> - describes how to show the colors accurately. It contains no personal information; you can remove it too if you prefer.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Don&apos;t social networks remove this anyway?</h3>
          <p>The big ones usually strip location data from public posts - but photos sent by email, messaging apps that send &quot;original quality&quot;, cloud links, and marketplace listings often keep everything.</p>
        </div>
        <div className="faq-item">
          <h3>Are my photos uploaded?</h3>
          <p>No. Reading and removing metadata both happen on your device; nothing is sent anywhere.</p>
        </div>
        <div className="faq-item">
          <h3>What about motion photos?</h3>
          <p>Some phones attach a short video or depth map after the photo, each with its own metadata. Cleaning removes those extras and keeps the still photo.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Convert iPhone photos with <Link to="/tool/heic-to-jpg">HEIC to JPG</Link>, shrink files with the{' '}
          <Link to="/tool/image-compressor">Image Compressor</Link>, or browse all{' '}
          <Link to="/category/graphics-media">Graphics &amp; Media tools</Link>.
        </p>
      </article>
    </div>
  );
}
