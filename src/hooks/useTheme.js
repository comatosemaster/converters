import { useEffect, useState } from 'react';

const STORAGE_KEY = 'theme';

// The theme the prerendered HTML was built with. Every page's markup is
// generated at build time, where there's no visitor and no saved choice,
// so it's rendered for the default (dark) theme.
const BUILD_THEME = 'dark';

// What the inline script in index.html actually applied to
// <html data-theme="..."> before the page painted.
function readAppliedTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

// Site-wide light/dark theme. Dark is the default for a first-time
// visitor; light is still fully available via the toggle and, once
// explicitly chosen, is remembered in localStorage so it persists
// across visits - see the small inline script in index.html that
// applies dark before first paint unless light was explicitly saved.
//
// The colours themselves never depend on this hook - the inline script has
// set them before first paint. This state only drives the toggle button's
// icon and label. It starts at BUILD_THEME so the browser's first render
// matches the prerendered markup exactly (anything else is a hydration
// mismatch for every light-theme visitor), then adopts the real theme
// straight after.
export function useTheme() {
  const [theme, setTheme] = useState(BUILD_THEME);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    setTheme(readAppliedTheme());
    setSynced(true);
  }, []);

  useEffect(() => {
    // Until the real theme has been read, `theme` is only the build
    // default - applying or saving it would overwrite a visitor's choice.
    if (!synced) return;

    // Light is the CSS default and needs no attribute at all - only dark
    // needs one, keeping the common case (light) attribute-free.
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private browsing / storage disabled - theme still applies for
      // this page load, it just won't be remembered next time.
    }
  }, [theme, synced]);

  function toggleTheme() {
    setTheme((previous) => (previous === 'dark' ? 'light' : 'dark'));
  }

  return { theme, toggleTheme };
}
