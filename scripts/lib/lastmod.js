// -----------------------------------------------------------------------
// "LAST MODIFIED" DATES FOR TOOL PAGES
//
// Blog articles carry their own dates in frontmatter. Tools don't, and a
// hand-maintained date field would be forgotten the first time someone
// edits a tool. So a tool's date is the date of the last git commit that
// touched its folder (src/tools/<folder>/) - a real, automatic answer to
// "when did this page last change".
//
// Read once by vite.config.js and baked into the bundle, so the route
// registry (src/seo/routes.js) can expose it without the browser or the
// prerender step ever running git themselves.
//
// When the history isn't trustworthy the dates are left out entirely
// rather than guessed. A shallow clone (common on CI) only knows its newest
// commit, so every tool would appear to have changed today - and a sitemap
// that says everything changed every build teaches search engines to
// ignore its dates.
// -----------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readRegistry, REPO_ROOT } from './registryData.js';

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

// Returns { tools: { [toolId]: 'YYYY-MM-DD' }, registry: 'YYYY-MM-DD' }.
// The registry date matters for the homepage and category pages: they list
// names, descriptions and intro copy that live in registry.js itself.
// Both are empty when git can't give honest dates.
export async function readLastmod() {
  const none = { tools: {}, registry: null };
  try {
    if (git(['rev-parse', '--is-shallow-repository']) === 'true') {
      console.warn('lastmod: shallow git clone - tool dates omitted from the sitemap.');
      return none;
    }
  } catch {
    console.warn('lastmod: git unavailable - tool dates omitted from the sitemap.');
    return none;
  }

  const { tools } = await readRegistry();
  const dates = {};
  for (const tool of tools) {
    if (!tool.modulePath) continue;
    // './base64/Base64Tool.jsx' -> 'src/tools/base64'
    const folder = path.posix.join('src/tools', path.posix.dirname(tool.modulePath));
    // %cs = committer date as YYYY-MM-DD. Empty for a folder that has
    // never been committed (a brand-new tool), which is simply skipped.
    const date = git(['log', '-1', '--format=%cs', '--', folder]);
    if (date) dates[tool.id] = date;
  }
  return { tools: dates, registry: git(['log', '-1', '--format=%cs', '--', 'src/tools/registry.js']) || null };
}
