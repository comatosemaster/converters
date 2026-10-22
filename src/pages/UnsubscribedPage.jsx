import { Link } from 'react-router-dom';
import { MailMinus } from 'lucide-react';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import { useCurrentRoute } from '../hooks/useCurrentRoute.js';
import { CONTACT_EMAIL } from '../config/publicConfig.js';

// Where an unsubscribe lands (POST /api/unsubscribe redirects here).

export default function UnsubscribedPage() {
  const route = useCurrentRoute();
  useDocumentMeta(route);

  return (
    <div className="static-page notice-page">
      <span className="notice-icon" aria-hidden="true">
        <MailMinus size={28} />
      </span>
      <h1>You’ve been unsubscribed</h1>
      <p>
        You won’t get any more update emails from NeatSize. Your address is kept only as
        “unsubscribed”, so it’s never emailed again - write to{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> if you’d like it deleted entirely.
      </p>
      <p>Changed your mind? You can subscribe again from the bottom of any page.</p>
      <p className="notice-actions">
        <Link to="/" className="btn btn-primary">
          Back to the tools
        </Link>
      </p>
    </div>
  );
}
