import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { highlightCodeBlocks } from '../../blog/prismHighlight.js';

// Renders an article's pre-rendered HTML body (see renderMarkdown() in
// blogUtils.js), then "hydrates" the plain HTML afterward:
//  - lazily loads and applies Prism syntax highlighting to any code blocks
//  - wires up each code block's Copy button via one delegated click
//    listener, since these buttons live inside raw HTML rather than being
//    React elements React could attach individual handlers to
//  - routes internal links (e.g. to a tool) through the router, like every
//    <Link> elsewhere on the site - see handleInternalLink below
export default function ArticleContent({ html }) {
  const containerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (containerRef.current) highlightCodeBlocks(containerRef.current);
  }, [html]);

  // Links in the article text are plain <a> tags from the markdown, not
  // router <Link>s, so on their own they trigger a full page load. That is
  // slower, and it used to land the new page scrolled to wherever the
  // article had been (see the ScrollRestoration note in Layout.jsx).
  // Handing same-site links to the router makes them behave exactly like
  // the "Related tools" cards: instant, and the new page starts at the top.
  //
  // Anything a person would expect the browser to handle itself is left
  // alone: modified clicks (new tab/window), other mouse buttons, links
  // with a target or download attribute, in-page #anchors, and anything
  // off-site - including protocol-relative "//host" URLs.
  function handleInternalLink(event) {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return false;
    const href = anchor.getAttribute('href');
    const isSameSite = href.startsWith('/') && !href.startsWith('//');
    const isPlainClick =
      event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (!isSameSite || !isPlainClick || anchor.target || anchor.hasAttribute('download')) return false;

    event.preventDefault();
    navigate(href);
    return true;
  }

  function handleClick(event) {
    if (handleInternalLink(event)) return;

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
