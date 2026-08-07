// -----------------------------------------------------------------------
// Lazy syntax highlighting for article code blocks. Prism's core already
// understands markup/css/clike/javascript; every other language is
// imported on demand, and only the languages actually present in the
// article currently being read - never the whole Prism language catalog
// up front. Kept separate from ArticleContent.jsx so the loading/ordering
// logic can be read on its own.
// -----------------------------------------------------------------------

import Prism from 'prismjs';

// Some Prism language components extend/clone another one, so that
// dependency has to be loaded (and registered into Prism.languages)
// first - see prism-jsx.js/prism-tsx.js/prism-typescript.js in
// node_modules for where these requirements come from.
const DEPENDENCIES = {
  typescript: ['javascript'],
  jsx: ['javascript'],
  tsx: ['javascript', 'typescript', 'jsx'],
  scss: ['css'],
};

const BUILT_IN = new Set(['markup', 'html', 'xml', 'svg', 'css', 'clike', 'javascript', 'js', 'text']);

const loaded = new Set(BUILT_IN);

async function loadLanguage(lang) {
  if (loaded.has(lang)) return;
  // Marked before the import resolves, so two code blocks needing the same
  // language in one article don't race and import it twice.
  loaded.add(lang);

  for (const dependency of DEPENDENCIES[lang] ?? []) {
    // eslint-disable-next-line no-await-in-loop -- each dependency clones/extends the previous, so order matters
    await loadLanguage(dependency);
  }

  try {
    await import(`prismjs/components/prism-${lang}.js`);
  } catch {
    // Not a real/supported Prism language id - the code block just stays
    // plain, unhighlighted text, which is still perfectly readable.
  }
}

// Highlights every `<pre><code class="language-*">` inside `container`.
export async function highlightCodeBlocks(container) {
  const codeBlocks = [...container.querySelectorAll('code[class*="language-"]')].filter(
    (block) => !block.dataset.highlighted,
  );
  if (codeBlocks.length === 0) return;

  // Marked synchronously, before any of the async work below - React's
  // StrictMode intentionally double-invokes effects in development, which
  // would otherwise start two concurrent highlight passes over the same
  // block (both reading the same plain-text starting point, each writing
  // their own result back independently). Marking up front means the
  // second pass sees these blocks as already spoken for and skips them.
  codeBlocks.forEach((block) => {
    block.dataset.highlighted = 'true';
  });

  const languages = new Set();
  codeBlocks.forEach((block) => {
    const match = block.className.match(/language-(\S+)/);
    if (match) languages.add(match[1]);
  });

  await Promise.all([...languages].map(loadLanguage));
  codeBlocks.forEach((block) => Prism.highlightElement(block));
}
