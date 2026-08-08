// -----------------------------------------------------------------------
// READING BLOG ARTICLES FROM NODE
//
// Unlike the registry, the blog needs no parsing tricks: articles are
// markdown files, and src/blog/frontmatter.js is deliberately plain ESM
// with no Vite features, so Node can import the very same parser the
// website renders with.
//
// That shared parser is the point - a build script that parsed
// frontmatter its own way would eventually disagree with the site about
// what an article's slug or date is, and the sitemap would quietly point
// at URLs that don't exist.
// -----------------------------------------------------------------------

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter } from '../../src/blog/frontmatter.js';
import { REPO_ROOT } from './registryData.js';

export const BLOG_CONTENT_DIR = path.join(REPO_ROOT, 'src', 'content', 'blog');

export async function readArticles() {
  let files;
  try {
    files = await readdir(BLOG_CONTENT_DIR);
  } catch {
    return [];
  }

  // Mirrors blogUtils.js's own glob: a leading underscore marks a
  // template, not a published article.
  const markdown = files.filter((file) => file.endsWith('.md') && !file.startsWith('_'));

  const articles = [];
  for (const file of markdown) {
    // eslint-disable-next-line no-await-in-loop -- small corpus; sequential keeps errors attributable to a file
    const raw = await readFile(path.join(BLOG_CONTENT_DIR, file), 'utf8');
    const { data } = parseFrontmatter(raw);

    articles.push({
      slug: data.slug || file.replace(/\.md$/, ''),
      title: data.title ?? '',
      category: data.category ?? null,
      publishDate: data.publishDate ?? null,
      updatedDate: data.updatedDate ?? null,
      featured: Boolean(data.featured),
    });
  }

  return articles.sort((a, b) => String(b.publishDate).localeCompare(String(a.publishDate)));
}
