import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CONTACT_EMAIL, EMAIL_PROMISE, FORMS_ENABLED } from '../config/publicConfig.js';
import { useTurnstile } from '../hooks/useTurnstile.js';

// The "Request a Tool" form. The email is optional; "Email me when it
// ships" is unchecked by default and only then signs the address up (with
// the usual confirmation email).

const LIMITS = { min: 10, max: 1000, detailsMax: 1000 };

export default function RequestToolForm() {
  const { formRef, widgetRef, getToken, reset, error: captchaError } = useTurnstile();
  const [description, setDescription] = useState('');
  const [details, setDetails] = useState('');
  const [email, setEmail] = useState('');
  const [notify, setNotify] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | sending | done | error
  const [message, setMessage] = useState('');

  if (!FORMS_ENABLED) {
    return (
      <p className="field-hint">
        The request form opens soon. Until then, email your idea to{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    );
  }

  const length = description.trim().length;

  async function handleSubmit(event) {
    event.preventDefault();
    if (length < LIMITS.min) {
      setStatus('error');
      setMessage(`Please describe the tool in at least ${LIMITS.min} characters.`);
      return;
    }
    if (notify && !email.trim()) {
      setStatus('error');
      setMessage('Add your email address so we can tell you when it ships - or untick the box.');
      return;
    }
    setStatus('sending');
    setMessage('');
    try {
      const turnstileToken = await getToken();
      const response = await fetch('/api/request-tool', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description, details, email, notify, turnstileToken }),
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

  if (status === 'done') {
    return (
      <div className="request-done" role="status">
        <p>{message}</p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setDescription('');
            setDetails('');
            setStatus('idle');
            setMessage('');
          }}
        >
          Request another tool
        </button>
      </div>
    );
  }

  return (
    <form ref={formRef} className="request-form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="request-description">What should the tool do?</label>
        <textarea
          id="request-description"
          rows={5}
          required
          minLength={LIMITS.min}
          maxLength={LIMITS.max}
          value={description}
          placeholder="e.g. Convert a Word document to PDF, keeping the formatting"
          onChange={(event) => setDescription(event.target.value)}
          aria-describedby="request-description-count"
        />
        <p id="request-description-count" className="field-hint">
          {length < LIMITS.min ? `At least ${LIMITS.min} characters` : `${length} / ${LIMITS.max}`}
        </p>
      </div>

      <div className="field">
        <label htmlFor="request-details">
          Example or file types <span className="field-optional">(optional)</span>
        </label>
        <textarea
          id="request-details"
          rows={3}
          maxLength={LIMITS.detailsMax}
          value={details}
          placeholder="e.g. .docx files from Word 365, around 20 pages"
          onChange={(event) => setDetails(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="request-email">
          Email <span className="field-optional">(optional)</span>
        </label>
        <input
          id="request-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          placeholder="you@example.com"
          onChange={(event) => setEmail(event.target.value)}
          aria-describedby="request-email-promise"
        />
        <p id="request-email-promise" className="subscribe-promise">
          {EMAIL_PROMISE} <Link to="/privacy">Privacy</Link>
        </p>
        <label className="checkbox-field request-notify">
          <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} />
          Email me when it ships
        </label>
      </div>

      <div ref={widgetRef} className="subscribe-captcha" />

      {(message || captchaError) && (
        <p className="subscribe-error" role="alert">
          {message || captchaError}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-lg" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Send request'}
      </button>
    </form>
  );
}
