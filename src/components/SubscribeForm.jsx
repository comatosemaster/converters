import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EMAIL_PROMISE, FORMS_ENABLED } from '../config/publicConfig.js';
import { useTurnstile } from '../hooks/useTurnstile.js';

// The inline email sign-up: one field, one button, the promise line.
// No popups, no auto-focus - it sits where it's placed and waits.
//
// `source` records where people signed up (footer, blog...), only so we
// can tell which placements are worth keeping.

export default function SubscribeForm({ source, title, description, compact = false }) {
  const { formRef, widgetRef, getToken, reset, error: captchaError } = useTurnstile();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | done | error
  const [message, setMessage] = useState('');

  if (!FORMS_ENABLED) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus('sending');
    setMessage('');
    try {
      const turnstileToken = await getToken();
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, source, turnstileToken }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
      setStatus('done');
      setMessage(result.message);
    } catch (submitError) {
      setStatus('error');
      setMessage(submitError.message);
    } finally {
      reset();
    }
  }

  const fieldId = `subscribe-email-${source}`;

  return (
    <div className={compact ? 'subscribe compact' : 'subscribe'}>
      {title && <h2 className="subscribe-title">{title}</h2>}
      {description && <p className="subscribe-description">{description}</p>}
      {status === 'done' ? (
        <p className="subscribe-success" role="status">
          {message}
        </p>
      ) : (
        <form ref={formRef} className="subscribe-form" onSubmit={handleSubmit}>
          <label htmlFor={fieldId} className="visually-hidden">
            Email address
          </label>
          <div className="subscribe-row">
            <input
              id={fieldId}
              type="email"
              name="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby={`${fieldId}-promise`}
            />
            <button type="submit" className="btn btn-primary" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Subscribe'}
            </button>
          </div>
          <div ref={widgetRef} className="subscribe-captcha" />
          <p id={`${fieldId}-promise`} className="subscribe-promise">
            {EMAIL_PROMISE} <Link to="/privacy">Privacy</Link>
          </p>
          {(message || captchaError) && (
            <p className="subscribe-error" role="alert">
              {message || captchaError}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
