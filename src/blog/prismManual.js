// Switches Prism to manual mode. Must be imported BEFORE 'prismjs'.
//
// Out of the box, Prism highlights every code block on the page by itself
// as soon as it loads. Articles are prerendered now, so their code blocks
// are already in the HTML at that point - and Prism rewriting them before
// React hydrates makes the page's markup disagree with what React expects
// (a hydration mismatch). With manual mode, highlighting only ever happens
// where this site asks for it: highlightCodeBlocks(), run from
// ArticleContent's effect, after hydration.
//
// Prism reads the flag from a global `Prism` object when its module first
// runs, which is why this lives in its own module, imported first.
if (typeof window !== 'undefined') {
  window.Prism = window.Prism || {};
  window.Prism.manual = true;
}
