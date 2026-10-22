import { Link } from 'react-router-dom';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import { useCurrentRoute } from '../hooks/useCurrentRoute.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { CONTACT_EMAIL } from '../config/publicConfig.js';

// The privacy policy. Plain language, and only what's actually true of the
// code: if anything here changes (a new stored field, a new service), this
// page has to change with it.

export default function PrivacyPage() {
  const route = useCurrentRoute();
  useDocumentMeta(route);

  return (
    <div className="static-page prose-page">
      <Breadcrumbs items={route.breadcrumbs} />
      <h1>Privacy Policy</h1>
      <p className="prose-lead">
        Short version: the tools never send your files or text anywhere, there are no ads or
        tracking scripts, and if you sign up for email updates we keep only what’s needed to send
        them.
      </p>

      <h2>The tools</h2>
      <p>
        Every tool on NeatSize runs inside your browser. Images, PDFs, documents and text you open
        or type are processed on your own device and are never uploaded to us or anyone else.
        There are no analytics or advertising scripts on the site, and NeatSize itself doesn’t set
        cookies.
      </p>
      <p>
        A few tools download something they need, without sending your data: the{' '}
        <Link to="/tool/currency-converter">Currency Converter</Link> fetches exchange rates from the
        Frankfurter API, and the <Link to="/tool/background-remover">Background Remover</Link>{' '}
        downloads its AI model from Hugging Face and its runtime from jsDelivr. Like any website,
        those services see your IP address when your browser contacts them.
      </p>

      <h2>Email updates</h2>
      <p>If you subscribe to updates about new tools and guides, we store:</p>
      <ul>
        <li>your email address;</li>
        <li>whether the subscription is pending, active or unsubscribed;</li>
        <li>when you signed up, confirmed and unsubscribed, and which sign-up form you used;</li>
        <li>
          a <strong>hashed</strong> version of your IP address - a one-way, salted fingerprint, not
          the address itself - used only to stop the same connection from flooding the forms;
        </li>
        <li>which weekly emails you’ve been sent, so nobody gets the same one twice.</li>
      </ul>
      <p>
        We use it for one thing: emailing you when new tools or guides are published, at most once a
        week. It is never sold, shared for marketing, or used for anything else. Email opens and
        clicks are not tracked; links in the emails only carry a <code>utm_source=newsletter</code>{' '}
        tag.
      </p>

      <h2>How long it’s kept</h2>
      <ul>
        <li>A sign-up you don’t confirm is deleted automatically after 7 days.</li>
        <li>An active subscription is kept until you unsubscribe.</li>
        <li>
          After you unsubscribe, the address is kept marked “unsubscribed” only so it’s never emailed
          again. Ask us and we’ll delete it completely.
        </li>
        <li>Abuse-prevention records (the hashed IP and time of each form submission) are deleted after 24 hours.</li>
      </ul>

      <h2>Tool requests</h2>
      <p>
        When you <Link to="/request-tool">request a tool</Link>, we store your description, the
        optional example, your email if you give one, the date, and the same hashed IP. If you ask
        to be told when it ships, you’re signed up for the email updates above (after confirming
        your address), and the update that announces it says so.
      </p>

      <h2>Services we use</h2>
      <ul>
        <li><strong>Cloudflare</strong> - hosts the site, stores subscriber data in its D1 database, and runs Turnstile, the privacy-friendly spam check on the forms.</li>
        <li><strong>Resend</strong> - sends the emails.</li>
      </ul>

      <h2>Your choices</h2>
      <p>
        Every email has a one-click unsubscribe link. To see or delete everything we hold about you,
        or with any question, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> - we’ll
        reply within a few days.
      </p>
    </div>
  );
}
