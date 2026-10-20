import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readLastmod } from './scripts/lib/lastmod.js'

// https://vite.dev/config/
export default defineConfig(async ({ isSsrBuild }) => ({
  plugins: [react()],
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
