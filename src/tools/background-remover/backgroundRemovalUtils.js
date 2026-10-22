// -----------------------------------------------------------------------
// BACKGROUND REMOVAL - no React. Browser-only.
//
// An AI segmentation model (ISNet "general use", from the DIS project,
// MIT/Apache-licensed) predicts for every pixel how likely it is to be
// part of the main subject. That prediction becomes the alpha channel of
// the photo.
//
// It runs with ONNX Runtime Web: on the graphics card through WebGPU when
// the browser offers it (about a second), otherwise on the processor
// (WebAssembly, slower - roughly 5 to 20 seconds per photo).
//
// What's downloaded, and why it's not served from neatsize.com:
//  - the model (44 MB) from Hugging Face, pinned to one exact revision so
//    it can't change underneath the tool. Cached in the browser after the
//    first time, so later visits start immediately and work offline.
//  - ONNX Runtime's WebAssembly files from jsDelivr, pinned to the exact
//    npm version installed here. The WebGPU build is 27 MB, over the
//    25 MB per-file limit of the site's hosting.
// Only code and model weights are downloaded - the photo itself never
// leaves the device.
// -----------------------------------------------------------------------

const MODEL_REPO = 'xrds/isnet-general-onnx-int8';
const MODEL_REVISION = '71eff2372ec9c8edbc6ca637ded591423d23b65a';
export const MODEL_URL = `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_REVISION}/onnx/model_quantized.onnx`;
export const MODEL_SIZE_MB = 44;
const MODEL_CACHE = 'neatsize-models-v1';

// The model's fixed input size.
const SIZE = 1024;

let ortPromise = null;
let sessionPromise = null;
let modelBytesPromise = null;

function loadRuntime(useGpu) {
  if (!ortPromise) {
    ortPromise = import('onnxruntime-web').then((ort) => {
      ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`;
      // On the processor path, run inference in a background worker so the
      // page stays responsive meanwhile. (WebGPU work already happens off
      // the main thread, and the worker proxy doesn't support it.) This
      // has to be decided before the runtime starts up.
      ort.env.wasm.proxy = !useGpu;
      return ort;
    });
  }
  return ortPromise;
}

// Downloads the model once, reporting progress, and keeps it in the
// browser's Cache Storage for next time.
async function fetchModel(onProgress) {
  let cache = null;
  try {
    cache = await caches.open(MODEL_CACHE);
    const cached = await cache.match(MODEL_URL);
    if (cached) {
      onProgress?.({ phase: 'model', loaded: 1, total: 1, cached: true });
      return new Uint8Array(await cached.arrayBuffer());
    }
  } catch {
    // Cache Storage can be unavailable (e.g. some private windows) - just
    // download without caching.
  }

  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`The AI model couldn't be downloaded (error ${response.status}).`);
  const total = Number(response.headers.get('content-length')) || MODEL_SIZE_MB * 1024 * 1024;
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.({ phase: 'model', loaded, total });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    await cache?.put(MODEL_URL, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }));
  } catch {
    // Out of storage space: still works, just downloads again next time.
  }
  return bytes;
}

async function hasWebGpu() {
  try {
    return Boolean(navigator.gpu && (await navigator.gpu.requestAdapter()));
  } catch {
    return false;
  }
}

/**
 * Loads the runtime and model (once per page visit). Resolves to
 * { session, ort, device: 'webgpu' | 'wasm' }.
 */
export function loadModel(onProgress) {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const useGpu = await hasWebGpu();
      const [ort, bytes] = await Promise.all([loadRuntime(useGpu), (modelBytesPromise ??= fetchModel(onProgress))]);
      onProgress?.({ phase: 'init' });
      if (useGpu) {
        try {
          // A copy: creating a session can take ownership of the buffer,
          // and the processor fallback below needs the bytes intact.
          const session = await ort.InferenceSession.create(bytes.slice(), { executionProviders: ['webgpu'] });
          return { session, ort, device: 'webgpu' };
        } catch {
          // Some GPUs/drivers fail here - fall back to the processor.
        }
      }
      const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
      return { session, ort, device: 'wasm' };
    })().catch((error) => {
      // Let a later attempt (e.g. after reconnecting) start over.
      sessionPromise = null;
      modelBytesPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Predicts the subject mask for `img`. Returns a canvas the size of the
 * image whose alpha channel is the mask (opaque = keep).
 */
export async function predictMask(img, onProgress) {
  const { session, ort } = await loadModel(onProgress);
  onProgress?.({ phase: 'run' });

  // The model sees the photo squashed to 1024x1024, normalized the way it
  // was trained: (value - 128) / 256 per channel, planar RGB.
  const input = makeCanvas(SIZE, SIZE);
  const ictx = input.getContext('2d', { willReadFrequently: true });
  ictx.imageSmoothingQuality = 'high';
  ictx.drawImage(img, 0, 0, SIZE, SIZE);
  const pixels = ictx.getImageData(0, 0, SIZE, SIZE).data;
  const plane = SIZE * SIZE;
  const data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) {
    data[i] = (pixels[i * 4] - 128) / 256;
    data[plane + i] = (pixels[i * 4 + 1] - 128) / 256;
    data[2 * plane + i] = (pixels[i * 4 + 2] - 128) / 256;
  }

  const results = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, SIZE, SIZE]) });
  const prediction = results[session.outputNames[0]].data;

  // Stretch the prediction to the full 0-1 range, as the model's authors
  // do, so the subject is fully opaque and the background fully clear.
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < plane; i += 1) {
    if (prediction[i] < min) min = prediction[i];
    if (prediction[i] > max) max = prediction[i];
  }
  const range = max - min || 1;
  const small = makeCanvas(SIZE, SIZE);
  const sctx = small.getContext('2d');
  const maskData = sctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < plane; i += 1) maskData.data[i * 4 + 3] = Math.round(((prediction[i] - min) / range) * 255);
  sctx.putImageData(maskData, 0, 0);

  // Back to the photo's own size, smoothly.
  const mask = makeCanvas(img.naturalWidth, img.naturalHeight);
  const mctx = mask.getContext('2d');
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(small, 0, 0, mask.width, mask.height);
  return mask;
}

/**
 * The photo with its background removed, at full resolution. `background`
 * is null (transparent) or a CSS color to put behind the subject.
 */
export function composeCutout(img, mask, background) {
  const out = makeCanvas(img.naturalWidth, img.naturalHeight);
  const ctx = out.getContext('2d');
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.drawImage(img, 0, 0);
  if (background) {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.globalCompositeOperation = 'source-over';
  return out;
}

export function cutoutName(name, extension) {
  return `${name.replace(/\.[^./]+$/, '') || 'image'}-no-background.${extension}`;
}
