import { useEffect, useState } from 'react';

const STORAGE_KEY = 'theme';

// Reads whatever the inline script in index.html already applied to
// <html data-theme="..."> synchronously before this component ever
// mounted, so React starts in sync with what's already on screen
// instead of guessing again and risking a flash of the wrong theme.
// Guarded for environments with no `document` (e.g. this component
// rendering under Node during a build/test step, not just a browser).
function getInitialTheme() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

// Site-wide light/dark theme. Dark is the default for a first-time
// visitor; light is still fully available via the toggle and, once
// explicitly chosen, is remembered in localStorage so it persists
// across visits - see the small inline script in index.html that
// applies dark before first paint unless light was explicitly saved.
export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
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
  }, [theme]);

  function toggleTheme() {
    setTheme((previous) => (previous === 'dark' ? 'light' : 'dark'));
  }

  return { theme, toggleTheme };
}
