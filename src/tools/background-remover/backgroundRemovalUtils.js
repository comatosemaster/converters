// -----------------------------------------------------------------------
// BACKGROUND REMOVAL - no React. Browser-only.
//
// An AI segmentation model (ISNet "general use", from the DIS project,
// MIT/Apache-licensed) predicts for every pixel how likely it is to be
// part of the main subject. That prediction becomes the alpha channel of
// the photo. It runs with ONNX Runtime Web, in one of two ways:
//
//  - Graphics card (WebGPU), about a second per photo: a half-precision
//    copy of the model (88 MB). The smaller 8-bit copy can't be used
//    here - ONNX Runtime's WebGPU kernels compute it wrongly (an empty
//    mask) or refuse it outright, which is what users first ran into.
//  - Processor (WebAssembly), roughly 5-20 seconds: the 8-bit copy (44 MB).
//
// Either way the model runs in a background worker (isnetWorker.js), so
// the page never freezes while it works.
//
// The graphics card is tried first when the browser offers it. If it
// fails or returns an obviously broken result, the tool switches to the
// processor automatically for the rest of the visit.
//
// What's downloaded, and why it's not served from neatsize.com:
//  - the model, from Hugging Face, pinned to one exact revision so it
//    can't change underneath the tool, then kept in the browser's Cache
//    Storage - later visits start immediately and work offline.
//  - ONNX Runtime's WebAssembly files, from jsDelivr pinned to the exact
//    npm version installed here. The WebGPU build is 27 MB, over the
//    25 MB per-file limit of the site's hosting.
// Only code and model weights are downloaded - the photo itself never
// leaves the device.
// -----------------------------------------------------------------------

const MODELS = {
  gpu: {
    url: 'https://huggingface.co/imgly/isnet-general-onnx/resolve/440dea96dd4a3b06bbbf5abec3e26569dd7ec49f/onnx/model_fp16.onnx',
    sizeMB: 88,
  },
  cpu: {
    url: 'https://huggingface.co/xrds/isnet-general-onnx-int8/resolve/71eff2372ec9c8edbc6ca637ded591423d23b65a/onnx/model_quantized.onnx',
    sizeMB: 44,
  },
};
export const MODEL_SIZES_MB = [MODELS.cpu.sizeMB, MODELS.gpu.sizeMB];
const MODEL_CACHE = 'neatsize-models-v1';

// The model's fixed input size.
const SIZE = 1024;

// Downloads a model once, reporting progress, and keeps it in the
// browser's Cache Storage for next time.
async function fetchModel(model, onProgress) {
  let cache = null;
  try {
    cache = await caches.open(MODEL_CACHE);
    const cached = await cache.match(model.url);
    if (cached) {
      onProgress?.({ phase: 'model', cached: true });
      return new Uint8Array(await cached.arrayBuffer());
    }
  } catch {
    // Cache Storage can be unavailable (e.g. some private windows) - just
    // download without caching.
  }

  const response = await fetch(model.url);
  if (!response.ok) throw new Error(`The AI model couldn't be downloaded (error ${response.status}).`);
  const total = Number(response.headers.get('content-length')) || model.sizeMB * 1024 * 1024;
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  onProgress?.({ phase: 'model', loaded, total });
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
    await cache?.put(model.url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }));
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

// --- Running the model (always in a background worker) -----------------------

const workers = { webgpu: null, wasm: null };

function callWorker(worker, message, transfer, expected) {
  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.type === 'error') reject(new Error(data.message));
      else if (data.type === expected) resolve(data);
    };
    worker.onerror = (event) => reject(new Error(event.message || 'The background worker failed to start.'));
    worker.postMessage(message, transfer);
  });
}

// One worker per device, created (and its model downloaded) on first use.
function loadWorker(deviceName, onProgress) {
  if (!workers[deviceName]) {
    const model = deviceName === 'webgpu' ? MODELS.gpu : MODELS.cpu;
    workers[deviceName] = (async () => {
      const bytes = await fetchModel(model, onProgress);
      onProgress?.({ phase: 'init' });
      const worker = new Worker(new URL('./isnetWorker.js', import.meta.url), { type: 'module' });
      try {
        await callWorker(worker, { type: 'init', device: deviceName, bytes: bytes.buffer }, [bytes.buffer], 'ready');
      } catch (error) {
        worker.terminate();
        throw error;
      }
      return worker;
    })();
    // Let a later attempt (e.g. after reconnecting) start over.
    workers[deviceName].catch(() => {
      workers[deviceName] = null;
    });
  }
  return workers[deviceName];
}

async function runOn(deviceName, input, onProgress) {
  const worker = await loadWorker(deviceName, onProgress);
  onProgress?.({ phase: 'run', device: deviceName });
  const { output } = await callWorker(worker, { type: 'run', input }, [input.buffer], 'result');
  return output;
}

// --- Choosing between them ----------------------------------------------------

// null = not decided yet; then 'webgpu' or 'wasm' for the rest of the visit.
let device = null;

// A broken run usually gives NaN or a flat, constant image rather than
// throwing - treat those as failures too.
function looksValid(prediction) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < prediction.length; i += 1) {
    const v = prediction[i];
    if (!Number.isFinite(v)) return false;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min > 0.05;
}

function makeInput(img) {
  // The model sees the photo squashed to 1024x1024, normalized the way it
  // was trained: (value - 128) / 256 per channel, planar RGB.
  const canvas = makeCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const pixels = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const plane = SIZE * SIZE;
  const data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) {
    data[i] = (pixels[i * 4] - 128) / 256;
    data[plane + i] = (pixels[i * 4 + 1] - 128) / 256;
    data[2 * plane + i] = (pixels[i * 4 + 2] - 128) / 256;
  }
  return data;
}

async function predict(img, onProgress) {
  if (device === null) device = (await hasWebGpu()) ? 'webgpu' : 'wasm';
  if (device === 'webgpu') {
    try {
      const prediction = await runOn('webgpu', makeInput(img), onProgress);
      if (looksValid(prediction)) return { prediction, device };
    } catch {
      // Falls through to the processor below.
    }
    device = 'wasm';
    onProgress?.({ phase: 'fallback' });
  }
  return { prediction: await runOn('wasm', makeInput(img), onProgress), device };
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Predicts the subject mask for `img`. Resolves to { mask, device }: a
 * canvas the size of the image whose alpha channel is the mask (opaque =
 * keep), and which processor did the work.
 */
export async function predictMask(img, onProgress) {
  const { prediction, device: usedDevice } = await predict(img, onProgress);

  // Stretch the prediction to the full 0-1 range, as the model's authors
  // do, so the subject is fully opaque and the background fully clear.
  const plane = SIZE * SIZE;
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
  return { mask, device: usedDevice };
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
