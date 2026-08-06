import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search, ShieldCheck } from 'lucide-react';
import {
  CATEGORIES,
  getPopularTools,
  getToolsByCategory,
  searchTools,
  tools,
} from '../tools/registry.js';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import ToolGrid from '../components/ToolGrid.jsx';

// The homepage: hero + search, popular tools, then every tool grouped by
// category, then an FAQ. Everything comes from the registry - this file
// never needs to change when a new tool is added.

const FAQS = [
  {
    q: 'Are these tools really free?',
    a: 'Yes - every tool is free with no sign-up, no account, and no usage limits. Because everything runs in your own browser rather than on a server, there are no per-conversion costs to pass on to you.',
  },
  {
    q: 'Do my files get uploaded anywhere?',
    a: 'No. Every tool processes your files and text locally in your browser using standard web APIs. Your data never touches a server, which is also why the tools keep working even if you go offline after the page loads.',
  },
  {
    q: 'Is there a file size limit?',
    a: "There's no server-imposed limit - the practical ceiling is your own device's memory. Very large files (hundreds of megabytes) may be slow, and a few tools set a sensible cap so a huge file can't freeze the page.",
  },
  {
    q: 'Do I need to install anything?',
    a: 'No. Everything runs in a normal browser tab. A couple of the heavier tools (OCR, HEIC conversion) download their processing engine the first time you use them, then cache it for next time.',
  },
  {
    q: 'Which browsers are supported?',
    a: 'Any current version of Chrome, Edge, Firefox, or Safari. A small number of features depend on newer browser APIs - where that matters, the tool tells you instead of failing silently.',
  },
];

export default function Home() {
  const [query, setQuery] = useState('');

  useDocumentMeta({
    title: 'Rootconverter - Free Browser-Based Converters & Tools',
    description:
      'A collection of fast, free, privacy-first online tools. Convert images, format JSON, generate QR codes, run OCR, and more - 100% in your browser, with no uploads.',
  });

  const categories = useMemo(() => getToolsByCategory(), []);
  const popular = useMemo(() => getPopularTools(), []);
  const results = useMemo(() => searchTools(query), [query]);
  const isSearching = query.trim().length > 0;

  const stats = [
    { value: tools.length, label: 'Tools available' },
    { value: CATEGORIES.length, label: 'Categories' },
    { value: '100%', label: 'Client-side' },
    { value: 'Free', label: 'Forever' },
  ];

  return (
    <div className="home">
      <section className="hero animate-in">
        <p className="hero-eyebrow">
          <strong>
            <ShieldCheck size={12} aria-hidden="true" /> Private
          </strong>
          Your files never leave your device
        </p>

        <h1>
          Every tool you need, <span className="accent-text">right in your browser</span>
        </h1>

        <p className="hero-sub">
          Convert images, format JSON, generate QR codes, extract text, and more. No uploads, no
          sign-up, no limits - just fast tools that run entirely on your own machine.
        </p>

        <div className="hero-search">
          <Search className="hero-search-icon" size={20} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for a tool - try “png”, “json”, or “qr”…"
            aria-label="Search tools"
            autoComplete="off"
          />
          <span className="kbd-hint">
            <kbd className="kbd">Ctrl K</kbd>
          </span>
        </div>

        <div className="hero-stats">
          {stats.map((stat) => (
            <div className="hero-stat" key={stat.label}>
              <span className="hero-stat-value">{stat.value}</span>
              <span className="hero-stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {isSearching ? (
        <section className="section" aria-live="polite">
          <div className="section-head">
            <div>
              <h2>
                {results.length} result{results.length === 1 ? '' : 's'} for “{query}”
              </h2>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setQuery('')}>
              Clear search
            </button>
          </div>
          <ToolGrid
            tools={results}
            query={query}
            emptyMessage="No tools match that search. Try a format name like “webp”, “json”, or “qr”."
          />
        </section>
      ) : (
        <>
          <section className="section">
            <div className="section-head">
              <div>
                <h2>Popular tools</h2>
                <p>The ones people reach for most.</p>
              </div>
            </div>
            <ToolGrid tools={popular} />
          </section>

          <section className="section">
            <div className="section-head">
              <div>
                <h2>Browse by category</h2>
                <p>All {tools.length} tools, grouped by what they do.</p>
              </div>
            </div>

            {categories.map((category) => {
              const CategoryIcon = category.icon;
              return (
                <section className="category-section" key={category.id} id={category.id}>
                  <div className="category-section-head">
                    <span className="category-icon" aria-hidden="true">
                      <CategoryIcon size={19} strokeWidth={1.75} />
                    </span>
                    <h2>
                      <Link to={`/category/${category.id}`}>{category.name}</Link>
                    </h2>
                    <span className="count-badge">
                      {category.tools.length} {category.tools.length === 1 ? 'tool' : 'tools'}
                    </span>
                  </div>
                  <ToolGrid
                    tools={category.tools}
                    emptyMessage="No tools in this category yet - more are on the way."
                  />
                </section>
              );
            })}
          </section>

          <section className="section">
            <div className="section-head">
              <div>
                <h2>Frequently asked questions</h2>
                <p>The short version: it&apos;s free, it&apos;s private, and it just works.</p>
              </div>
            </div>

            <div className="faq-list">
              {FAQS.map((faq) => (
                <details className="faq-entry" key={faq.q}>
                  <summary>{faq.q}</summary>
                  <div className="faq-entry-body">{faq.a}</div>
                </details>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="cta-panel">
              <h2>Can&apos;t find what you need?</h2>
              <p>
                New tools get added regularly - every one of them free, private, and running
                entirely in your browser.
              </p>
              <Link to="/category/graphics-media" className="btn btn-primary btn-lg">
                Browse all tools <ArrowRight size={16} />
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
