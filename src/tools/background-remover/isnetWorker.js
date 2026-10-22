// -----------------------------------------------------------------------
// Background worker that runs the background-removal model, on either
// the graphics card (WebGPU) or the processor (WebAssembly). Setting the
// model up and running it are heavy; doing both here instead of on the
// page keeps the page fully responsive - scrolling, buttons, the
// progress text - the whole time.
//
// Messages in:  { type: 'init', device: 'webgpu' | 'wasm', bytes }  (model file, transferred)
//               { type: 'run', input }                               (Float32Array, transferred)
// Messages out: { type: 'ready' } | { type: 'result', output } | { type: 'error', message }
// -----------------------------------------------------------------------

const SIZE = 1024;
let ort = null;
let session = null;

async function loadRuntime(device) {
  // The processor-only build is half the download (14 MB vs 27 MB), so the
  // graphics-card build is only fetched when it's actually used.
  const mod = device === 'webgpu' ? await import('onnxruntime-web') : await import('onnxruntime-web/wasm');
  // Same reasoning as in backgroundRemovalUtils.js: the runtime's .wasm
  // comes from jsDelivr, pinned to the installed version.
  mod.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${mod.env.versions.web}/dist/`;
  return mod;
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      ort = await loadRuntime(data.device);
      session = await ort.InferenceSession.create(new Uint8Array(data.bytes), { executionProviders: [data.device] });
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'run') {
      const results = await session.run({
        [session.inputNames[0]]: new ort.Tensor('float32', data.input, [1, 3, SIZE, SIZE]),
      });
      // A copy of its own, so its memory can be handed to the page outright.
      const output = new Float32Array(results[session.outputNames[0]].data);
      self.postMessage({ type: 'result', output }, [output.buffer]);
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || String(error) });
  }
};
