import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readLastmod } from './scripts/lib/lastmod.js'

// https://vite.dev/config/
export default defineConfig(async ({ isSsrBuild }) => ({
  plugins: [react()],
  resolve: {
    alias: [
      {
        // The Background Remover loads ONNX Runtime's 27 MB WebAssembly
        // file from a CDN (see backgroundRemovalUtils.js). Its default
        // build would make Vite copy that file into dist/, and Cloudflare
        // rejects any deployed file over 25 MB - so use the build that
        // leaves the .wasm out.
        find: /^onnxruntime-web$/,
        replacement: fileURLToPath(new URL('./node_modules/onnxruntime-web/dist/ort.min.mjs', import.meta.url)),
      },
    ],
  },
  define: {
    // Page dates from git history, read by src/seo/routes.js for the
    // sitemap's <lastmod>. See scripts/lib/lastmod.js.
    __LASTMOD__: JSON.stringify(await readLastmod()),
  },
  build: {
    // The server build (dist-ssr/) is only used at build time to render
    // pages to HTML - it doesn't need a second copy of public/.
    copyPublicDir: !isSsrBuild,
  },
}))
