// -----------------------------------------------------------------------
// PUBLIC (NON-SECRET) CONFIG for the email sign-up and "Request a Tool"
// forms.
//
// The Turnstile SITE key is public by design - it's sent to every visitor
// in the page. (Its pair, the SECRET key, is only ever on the Worker:
// `npx wrangler secret put TURNSTILE_SECRET_KEY`.)
//
// Set it in ONE of two ways (see docs/email-and-requests-setup.md):
//   - paste it below as TURNSTILE_SITE_KEY_PRODUCTION, or
//   - set VITE_TURNSTILE_SITE_KEY as a build variable (Cloudflare dashboard
//     -> the Worker -> Settings -> Build -> Variables), which wins.
//
// While it's empty, the forms aren't shown at all - so merging this before
// the rest is set up can't put a broken form on the site.
// -----------------------------------------------------------------------

const TURNSTILE_SITE_KEY_PRODUCTION = '';

const fromBuild =
  typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_TURNSTILE_SITE_KEY : undefined;

export const TURNSTILE_SITE_KEY = fromBuild || TURNSTILE_SITE_KEY_PRODUCTION;

export const FORMS_ENABLED = Boolean(TURNSTILE_SITE_KEY);

// The line shown beside every email field, word for word.
export const EMAIL_PROMISE = 'Only your email, only for new tools and guides. Unsubscribe in one click.';

// Where people can write to have their data removed or ask questions.
export const CONTACT_EMAIL = 'hello@neatsize.com';
