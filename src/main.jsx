import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { preloadForPath } from './router.jsx'

// Every real page arrives as prerendered HTML (scripts/prerender.js marks
// it with data-prerendered="page"). React "hydrates" it: it adopts the
// existing markup and attaches behaviour, instead of throwing it away and
// drawing the page again.
//
// The 404 page (data-prerendered="404") is the one exception. The same
// 404.html answers every unknown URL, so its markup was rendered for a
// placeholder path, not the one in the address bar - it's rendered fresh
// instead. So is the bare dev-server page, which has nothing in it yet.
const container = document.getElementById('root')
const app = (
  <StrictMode>
    <App />
  </StrictMode>
)

// 'utility' pages (e.g. /subscribed) are rendered for their real path too.
if (container.dataset.prerendered === 'page' || container.dataset.prerendered === 'utility') {
  // The current tool's code must be loaded first, or React would have to
  // swap its prerendered UI for a loading placeholder mid-hydration.
  preloadForPath(window.location.pathname).finally(() => {
    hydrateRoot(container, app, {
      // Mismatches between the prerendered HTML and the first browser
      // render are recoverable (React re-renders that part), but each one
      // is a bug worth seeing - the verification run fails on them.
      onRecoverableError(error, info) {
        console.error('Hydration error:', error, info?.componentStack ?? '')
      },
    })
  })
} else {
  createRoot(container).render(app)
}
