import { useState } from 'react';

// Share links for X and LinkedIn (their public share-intent URLs need no
// SDK or API key - just an encoded link), plus a "copy link" button that
// follows the same text-toggle pattern every other tool's copy button
// uses (see e.g. Base64Tool.jsx's "Copy" -> "Copied!").

export default function ShareButtons({ url, title }) {
  const [copied, setCopied] = useState(false);

  const absoluteUrl = new URL(url, window.location.origin).href;
  const twitterHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(absoluteUrl)}`;
  const linkedinHref = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(absoluteUrl)}`;

  function handleCopy() {
    navigator.clipboard.writeText(absoluteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="share-buttons">
      <span className="share-buttons-label">Share this article</span>
      <a className="ghost-button" href={twitterHref} target="_blank" rel="noopener noreferrer">
        Share on X
      </a>
      <a className="ghost-button" href={linkedinHref} target="_blank" rel="noopener noreferrer">
        Share on LinkedIn
      </a>
      <button type="button" className="copy-button" onClick={handleCopy}>
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  );
}
