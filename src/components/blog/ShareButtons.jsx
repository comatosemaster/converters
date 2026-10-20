import { useState } from 'react';
import { absoluteUrl } from '../../seo/siteConfig.js';

// Share links for X and LinkedIn (their public share-intent URLs need no
// SDK or API key - just an encoded link), plus a "copy link" button that
// follows the same text-toggle pattern every other tool's copy button
// uses (see e.g. Base64Tool.jsx's "Copy" -> "Copied!").

export default function ShareButtons({ url, title }) {
  const [copied, setCopied] = useState(false);

  // The production URL, never window.location: a share from a preview or
  // localhost should still point people at the real site. (It also keeps
  // this renderable at build time, where there is no window.)
  const shareUrl = absoluteUrl(url);
  const twitterHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(shareUrl)}`;
  const linkedinHref = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl).then(() => {
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
