import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bold,
  Code,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  SquareCode,
  Strikethrough,
  Table,
} from 'lucide-react';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatBytes } from '../../utils/formatBytes.js';
import { highlightCodeBlocks } from '../../blog/prismHighlight.js';
import {
  EXAMPLE_MARKDOWN,
  buildHtmlDocument,
  documentStats,
  formatAction,
  renderMarkdown,
} from './markdownUtils.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Toolbar buttons, in display order. `null` draws a divider.
const ACTIONS = [
  { id: 'bold', label: 'Bold', shortcut: 'Ctrl+B', icon: Bold },
  { id: 'italic', label: 'Italic', shortcut: 'Ctrl+I', icon: Italic },
  { id: 'strike', label: 'Strikethrough', icon: Strikethrough },
  { id: 'heading', label: 'Heading', icon: Heading2 },
  null,
  { id: 'link', label: 'Link', shortcut: 'Ctrl+K', icon: LinkIcon },
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'code', label: 'Inline code', icon: Code },
  { id: 'codeblock', label: 'Code block', icon: SquareCode },
  null,
  { id: 'bullet', label: 'Bulleted list', icon: List },
  { id: 'number', label: 'Numbered list', icon: ListOrdered },
  { id: 'task', label: 'Task list', icon: ListChecks },
  { id: 'quote', label: 'Quote', icon: Quote },
  { id: 'table', label: 'Table', icon: Table },
  { id: 'hr', label: 'Horizontal line', icon: Minus },
];

const SHORTCUTS = { b: 'bold', i: 'italic', k: 'link' };

const VIEWS = [
  { id: 'split', label: 'Split' },
  { id: 'write', label: 'Write' },
  { id: 'preview', label: 'Preview' },
];

function downloadText(text, fileName, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// Rendering, sanitizing and the toolbar's text edits live in
// markdownUtils.js. The preview reuses the blog's article styles
// (.article-body) and its Prism code highlighting, so a document looks
// the same here as an article does on the site.

export default function MarkdownEditor() {
  const textareaRef = useRef(null);
  const previewRef = useRef(null);
  const fileInputRef = useRef(null);

  const [text, setText] = useState('');
  const [fileBaseName, setFileBaseName] = useState('document');
  const [view, setView] = useState('split');
  const [breaks, setBreaks] = useState(false);
  const [syncScroll, setSyncScroll] = useState(true);
  const [copied, setCopied] = useState('');
  const [fileError, setFileError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  // The text as it was when last copied or downloaded - unsaved work is
  // anything typed since then.
  const [savedText, setSavedText] = useState('');
  const [pending, setPending] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const hasUnsavedWork = text.trim() !== '' && text !== savedText;
  useUnsavedChangesWarning(hasUnsavedWork);

  // Re-rendering a long document on every keystroke would make typing lag;
  // the deferred copy lets the editor stay responsive while the preview
  // catches up a moment later.
  const deferredText = useDeferredValue(text);
  const html = useMemo(() => renderMarkdown(deferredText, { breaks }), [deferredText, breaks]);
  const stats = useMemo(() => documentStats(deferredText, html), [deferredText, html]);

  // Prism colors code blocks after each render of the preview. Languages
  // load on demand, only those actually used in the document.
  useEffect(() => {
    if (previewRef.current && html) highlightCodeBlocks(previewRef.current);
  }, [html, view]);

  // Applies a toolbar edit as real typing (execCommand), which keeps the
  // browser's own Ctrl+Z history working. Setting the textarea's value
  // directly would wipe that history.
  function applyEdit(action) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const edit = formatAction(action, textarea.value, textarea.selectionStart, textarea.selectionEnd);
    if (!edit) return;
    textarea.focus();
    textarea.setSelectionRange(edit.start, edit.end);
    const inserted = document.execCommand('insertText', false, edit.insert);
    if (!inserted) {
      // Fallback for browsers without execCommand support.
      textarea.setRangeText(edit.insert, edit.start, edit.end, 'end');
      setText(textarea.value);
    }
    textarea.setSelectionRange(edit.selectStart, edit.selectEnd);
  }

  function handleKeyDown(event) {
    const mod = event.ctrlKey || event.metaKey;
    const action = mod && !event.altKey && !event.shiftKey ? SHORTCUTS[event.key.toLowerCase()] : null;
    if (action) {
      event.preventDefault();
      applyEdit(action);
    }
  }

  // Keeps the preview roughly at the same place in the document as the
  // editor (by scroll percentage - exact line mapping isn't possible once
  // Markdown has been turned into formatted blocks of different heights).
  function handleEditorScroll(event) {
    const preview = previewRef.current;
    if (!syncScroll || view !== 'split' || !preview) return;
    const source = event.target;
    const ratio = source.scrollTop / Math.max(1, source.scrollHeight - source.clientHeight);
    preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight);
  }

  function handlePreviewClick(event) {
    const anchor = event.target.closest('a[href^="#"]');
    if (anchor) {
      // In-document links scroll the preview box, not the whole page.
      event.preventDefault();
      const id = decodeURIComponent(anchor.getAttribute('href').slice(1));
      const target = id && previewRef.current.querySelector(`[id="${CSS.escape(id)}"]`);
      if (target) previewRef.current.scrollTop = target.offsetTop - previewRef.current.offsetTop - 8;
      return;
    }
    const button = event.target.closest('[data-copy-code]');
    const code = button?.closest('.code-block')?.querySelector('code');
    if (code) {
      navigator.clipboard.writeText(code.textContent).then(() => {
        button.textContent = 'Copied!';
        button.classList.add('copied');
        setTimeout(() => {
          button.textContent = 'Copy';
          button.classList.remove('copied');
        }, 1500);
      });
    }
  }

  function applyContent({ content, name }) {
    setText(content);
    setFileBaseName(name);
    setSavedText('');
  }

  function loadContent(content, name = 'document') {
    if (hasUnsavedWork) setPending({ content, name });
    else applyContent({ content, name });
  }

  async function loadFile(file) {
    if (file.size > MAX_FILE_SIZE) {
      setFileError(`That file is too large (over ${formatBytes(MAX_FILE_SIZE)}).`);
      return;
    }
    if (!/\.(md|markdown|mdown|txt)$/i.test(file.name) && !file.type.startsWith('text/')) {
      setFileError('Please choose a .md, .markdown or .txt file.');
      return;
    }
    try {
      const content = (await file.text()).replace(/^﻿/, '');
      setFileError('');
      loadContent(content, file.name.replace(/\.[^.]+$/, '') || 'document');
    } catch {
      setFileError('Could not read that file.');
    }
  }

  async function copy(kind) {
    const value = kind === 'markdown' ? text : renderMarkdown(text, { breaks, forExport: true });
    await navigator.clipboard.writeText(value);
    setSavedText(text);
    setCopied(kind);
    setTimeout(() => setCopied(''), 1500);
  }

  function download(kind) {
    if (kind === 'markdown') downloadText(text, `${fileBaseName}.md`, 'text/markdown');
    else downloadText(buildHtmlDocument(text, { breaks }), `${fileBaseName}.html`, 'text/html');
    setSavedText(text);
  }

  return (
    <div className="markdown-editor">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />
      {pending && (
        <ConfirmDialog
          title="Replace your document?"
          message="You have changes you haven't copied or downloaded yet. Loading this will replace them."
          confirmLabel="Replace"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            applyContent(pending);
            setPending(null);
          }}
        />
      )}
      {showClearConfirm && (
        <ConfirmDialog
          title="Clear your document?"
          message="This removes everything you've written. It can't be undone."
          confirmLabel="Clear"
          onCancel={() => setShowClearConfirm(false)}
          onConfirm={() => {
            setShowClearConfirm(false);
            applyContent({ content: '', name: 'document' });
            setFileError('');
          }}
        />
      )}

      <div className="md-topbar">
        <div className="mode-toggle" role="radiogroup" aria-label="View">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={view === v.id}
              className={view === v.id ? 'mode-button active' : 'mode-button'}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="converter-toolbar json-toolbar">
          <button type="button" className="ghost-button" onClick={() => fileInputRef.current?.click()}>
            Open .md file
          </button>
          {!text && (
            <button type="button" className="ghost-button" onClick={() => loadContent(EXAMPLE_MARKDOWN)}>
              Try an example
            </button>
          )}
          <button type="button" className="ghost-button" onClick={() => setShowClearConfirm(true)} disabled={!text}>
            Clear
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,.mdown,.txt,text/markdown,text/plain"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.target.files[0];
              if (file) loadFile(file);
              event.target.value = '';
            }}
          />
        </div>
      </div>

      {fileError && <p className="field-error">{fileError}</p>}

      <div className={`md-panes md-view-${view}`}>
        <div className="md-pane md-pane-editor">
          <div className="md-format-bar" role="toolbar" aria-label="Formatting">
            {ACTIONS.map((action, i) =>
              action ? (
                <button
                  key={action.id}
                  type="button"
                  className="md-format-button"
                  title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label}
                  aria-label={action.label}
                  // Keeps the textarea's selection: without this, clicking
                  // a button would blur the editor first.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyEdit(action.id)}
                >
                  <action.icon size={16} aria-hidden="true" />
                </button>
              ) : (
                <span key={`divider-${i}`} className="md-format-divider" aria-hidden="true" />
              ),
            )}
          </div>
          <textarea
            ref={textareaRef}
            className={isDragging ? 'md-textarea dragging' : 'md-textarea'}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={handleEditorScroll}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              const file = event.dataTransfer.files[0];
              // Dropped text (not a file) is left to the browser to insert.
              if (!file) return;
              event.preventDefault();
              setIsDragging(false);
              loadFile(file);
            }}
            spellCheck
            placeholder="Write Markdown here, or drop a .md file…"
            aria-label="Markdown"
          />
        </div>
        <div className="md-pane md-pane-preview">
          <div className="md-pane-label">Preview</div>
          <div
            ref={previewRef}
            className="article-body md-preview"
            onClick={handlePreviewClick}
            aria-label="Formatted preview"
            // Safe: renderMarkdown() runs the HTML through DOMPurify, which
            // removes scripts, event handlers and javascript: links - see
            // markdownUtils.js.
            dangerouslySetInnerHTML={{
              __html: html || '<p class="md-preview-empty">The formatted document appears here as you type.</p>',
            }}
          />
        </div>
      </div>

      <div className="md-footer">
        <p className="field-hint md-stats">
          {stats.words.toLocaleString()} words · {stats.characters.toLocaleString()} characters ·{' '}
          {stats.lines.toLocaleString()} lines · {stats.readingMinutes} min read
        </p>
        <div className="md-options">
          <label className="checkbox-field">
            <input type="checkbox" checked={breaks} onChange={(event) => setBreaks(event.target.checked)} />
            Keep single line breaks
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={syncScroll} onChange={(event) => setSyncScroll(event.target.checked)} />
            Sync scrolling
          </label>
        </div>
      </div>

      <div className="md-export">
        <button type="button" className="copy-button" onClick={() => copy('markdown')} disabled={!text}>
          {copied === 'markdown' ? 'Copied!' : 'Copy Markdown'}
        </button>
        <button type="button" className="copy-button" onClick={() => copy('html')} disabled={!text}>
          {copied === 'html' ? 'Copied!' : 'Copy HTML'}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => download('markdown')} disabled={!text}>
          Download .md
        </button>
        <button type="button" className="btn btn-primary" onClick={() => download('html')} disabled={!text}>
          Download .html
        </button>
      </div>

      <article className="tool-article">
        <p>
          This Markdown editor shows your formatted document live next to the text you type. Use
          it to write a README, documentation, notes or a blog post, check how tables and code
          blocks will look, then download the result as a .md file or a ready-to-open HTML page.
          It runs entirely in your browser - nothing you write is uploaded or stored.
        </p>

        <h2>How to use the editor</h2>
        <ol>
          <li>Type or paste Markdown on the left, or open a .md file. The preview updates as you type.</li>
          <li>Use the toolbar - or <kbd>Ctrl</kbd>+<kbd>B</kbd>, <kbd>Ctrl</kbd>+<kbd>I</kbd> and <kbd>Ctrl</kbd>+<kbd>K</kbd> - to add bold, italic and links without remembering the syntax. Press a button again to undo it.</li>
          <li>Switch between Split, Write and Preview views. On a phone, Write and Preview give each side the full screen.</li>
          <li>Copy the Markdown or HTML, or download a .md file or a standalone .html page.</li>
        </ol>

        <h2>Markdown cheat sheet</h2>
        <ul>
          <li><code># Heading</code>, <code>## Smaller heading</code> - one <code>#</code> per level, up to six.</li>
          <li><code>**bold**</code>, <code>_italic_</code>, <code>~~strikethrough~~</code> and <code>`inline code`</code>.</li>
          <li><code>[link text](https://example.com)</code> and <code>![image description](image-url)</code>.</li>
          <li><code>- item</code> for bullets, <code>1. item</code> for numbered lists, <code>- [ ] task</code> for checkboxes.</li>
          <li><code>&gt; quote</code> for a quotation, <code>---</code> for a horizontal line.</li>
          <li>Three backticks (<code>```js</code>) on the lines before and after a block of code, with an optional language for syntax highlighting.</li>
          <li>Tables use pipes: <code>| Name | Age |</code>, then a <code>| --- | --- |</code> line under the header.</li>
        </ul>

        <h2>GitHub-flavored Markdown</h2>
        <p>
          The preview follows GitHub-flavored Markdown (GFM), the variant used by GitHub, GitLab,
          Reddit and most documentation sites. On top of standard Markdown it adds tables, task
          lists, strikethrough and automatic links for plain URLs, so a README looks here the way
          it will on GitHub. By default a single line break inside a paragraph is ignored, as in
          standard Markdown - turn on <strong>Keep single line breaks</strong> to show every line
          break, like GitHub comments do.
        </p>

        <h2>Exporting to HTML</h2>
        <p>
          <strong>Download .html</strong> creates a complete web page with clean, readable
          styling built in, ready to open in any browser, email or print to PDF.{' '}
          <strong>Copy HTML</strong> gives just the HTML of the content, to paste into a CMS, a
          website or an email template. Any raw HTML in your Markdown is kept, but scripts and
          other active content are removed for safety.
        </p>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Is my document saved or uploaded?</h3>
          <p>No - it lives only in this browser tab. Download or copy it before you close the page; the site warns you if you try to leave with unsaved changes.</p>
        </div>
        <div className="faq-item">
          <h3>Is it safe to paste Markdown from elsewhere?</h3>
          <p>Yes. Markdown can contain raw HTML, so the preview runs everything through a sanitizer that strips scripts and event handlers before showing it. Links open in a new tab, so clicking one never closes your document.</p>
        </div>
        <div className="faq-item">
          <h3>Which languages get syntax highlighting?</h3>
          <p>Common ones including JavaScript, TypeScript, Python, HTML, CSS, JSON, YAML, SQL, Bash and many more - add the language name after the opening backticks.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Count words and check readability with the{' '}
          <Link to="/tool/word-counter-text-analyzer">Word Counter &amp; Text Analyzer</Link>,
          compare two drafts with the <Link to="/tool/text-diff">Text Diff Checker</Link>, or
          browse all <Link to="/category/text-data">Text &amp; Data tools</Link>.
        </p>
      </article>
    </div>
  );
}
