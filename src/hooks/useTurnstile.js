import { useCallback, useEffect, useRef, useState } from 'react';
import { TURNSTILE_SITE_KEY } from '../config/publicConfig.js';

// Cloudflare Turnstile (bot protection) for the sign-up and request forms.
//
// Page speed: the Turnstile script is NOT loaded with the page. It's
// fetched only once a form comes near the screen or gets focus - so a
// tool page that's never scrolled to the footer never loads it at all.
//
// UX: "interaction-only" keeps the widget invisible for almost everyone;
// it only shows a checkbox in the rare case Cloudflare isn't sure.

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise = null;

function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve(window.turnstile);
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('The spam check couldn’t load. Check your connection or ad blocker, then try again.'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

/**
 * Wires Turnstile to a form. Returns:
 *   formRef     - put on the <form>; it's watched to know when to load
 *   widgetRef   - an empty <div> inside the form where the widget lives
 *   getToken()  - resolves with a fresh token (waits for one if needed)
 *   reset()     - after each submit (tokens are single-use)
 */
export function useTurnstile() {
  const formRef = useRef(null);
  const widgetRef = useRef(null);
  const widgetIdRef = useRef(null);
  const tokenRef = useRef('');
  const waitersRef = useRef([]);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');

  // Start when the form is within ~300px of the viewport, or focused.
  useEffect(() => {
    const form = formRef.current;
    if (!form || active) return undefined;
    const start = () => setActive(true);
    form.addEventListener('focusin', start, { once: true });
    let observer;
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && start(), {
        rootMargin: '300px 0px',
      });
      observer.observe(form);
    }
    return () => {
      form.removeEventListener('focusin', start);
      observer?.disconnect();
    };
  }, [active]);

  useEffect(() => {
    if (!active || !TURNSTILE_SITE_KEY) return undefined;
    let cancelled = false;
    loadScript()
      .then((turnstile) => {
        if (cancelled || !widgetRef.current || widgetIdRef.current !== null) return;
        widgetIdRef.current = turnstile.render(widgetRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: 'interaction-only',
          theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
          'refresh-expired': 'auto',
          callback: (token) => {
            tokenRef.current = token;
            setError('');
            waitersRef.current.splice(0).forEach((w) => w.resolve(token));
          },
          'expired-callback': () => {
            tokenRef.current = '';
          },
          'error-callback': () => {
            tokenRef.current = '';
            setError('The spam check failed to load. Please refresh the page and try again.');
            return true;
          },
        });
      })
      .catch((loadError) => !cancelled && setError(loadError.message));
    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [active]);

  const getToken = useCallback(() => {
    setActive(true);
    if (tokenRef.current) return Promise.resolve(tokenRef.current);
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject };
      waitersRef.current.push(waiter);
      // Usually ready in well under a second; if a visible challenge is
      // showing, the visitor needs time to click it.
      setTimeout(() => {
        const index = waitersRef.current.indexOf(waiter);
        if (index !== -1) {
          waitersRef.current.splice(index, 1);
          reject(new Error('Please complete the spam check above the button, then press it again.'));
        }
      }, 30000);
    });
  }, []);

  const reset = useCallback(() => {
    tokenRef.current = '';
    if (widgetIdRef.current !== null && window.turnstile) window.turnstile.reset(widgetIdRef.current);
  }, []);

  return { formRef, widgetRef, getToken, reset, error };
}
