import { Link, useSearchParams } from 'react-router-dom';
import { MailCheck, MailX } from 'lucide-react';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import { useCurrentRoute } from '../hooks/useCurrentRoute.js';
import { useHydrated } from '../hooks/useHydrated.js';

// Where the confirmation link lands (/api/confirm redirects here).
// /subscribed?status=invalid means the link had expired or was already
// used. The query string isn't known when the page is prerendered, so that
// variant is shown right after hydration instead.

export default function SubscribedPage() {
  const route = useCurrentRoute();
  useDocumentMeta(route);
  const [params] = useSearchParams();
  const hydrated = useHydrated();
  const invalid = hydrated && params.get('status') === 'invalid';

  return (
    <div className="static-page notice-page">
      <span className={invalid ? 'notice-icon warn' : 'notice-icon'} aria-hidden="true">
        {invalid ? <MailX size={28} /> : <MailCheck size={28} />}
      </span>
      {invalid ? (
        <>
          <h1>That link has expired</h1>
          <p>
            Confirmation links work once, for 7 days. If you already clicked it, you’re subscribed and
            there’s nothing else to do. Otherwise, sign up again at the bottom of any page and use the
            newest email.
          </p>
        </>
      ) : (
        <>
          <h1>You’re subscribed</h1>
          <p>
            Thanks for confirming. You’ll get an email when new tools or guides go live on NeatSize -
            at most once a week, and only when there’s something new. Every email has a one-click
            unsubscribe link.
          </p>
        </>
      )}
      <p className="notice-actions">
        <Link to="/" className="btn btn-primary">
          Browse all tools
        </Link>
        <Link to="/blog" className="btn">
          Read the guides
        </Link>
      </p>
    </div>
  );
}
