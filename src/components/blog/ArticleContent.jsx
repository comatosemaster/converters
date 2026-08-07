import { useEffect, useRef } from 'react';
import { highlightCodeBlocks } from '../../blog/prismHighlight.js';

// Renders an article's pre-rendered HTML body (see renderMarkdown() in
// blogUtils.js), then "hydrates" the plain HTML afterward:
//  - lazily loads and applies Prism syntax highlighting to any code blocks
//  - wires up each code block's Copy button via one delegated click
//    listener, since these buttons live inside raw HTML rather than being
//    React elements React could attach individual handlers to
export default function ArticleContent({ html }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) highlightCodeBlocks(containerRef.current);
  }, [html]);

  function handleClick(event) {
    const button = event.target.closest('[data-copy-code]');
    if (!button) return;

    const code = button.closest('.code-block')?.querySelector('code');
    if (!code) return;

    navigator.clipboard.writeText(code.textContent).then(() => {
      const originalLabel = button.textContent;
      button.textContent = 'Copied!';
      button.classList.add('copied');
      setTimeout(() => {
        button.textContent = originalLabel;
        button.classList.remove('copied');
      }, 1600);
    });
  }

  return (
    <div
      ref={containerRef}
      className="article-body"
      onClick={handleClick}
      // Safe here specifically: `html` is generated at build time from
      // this project's own markdown files in src/content/blog/ (see
      // blogUtils.js) - never from user input or an external source.
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
