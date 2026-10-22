// Sends the double opt-in email. Shared by sign-ups from the subscribe
// form and from the "Request a Tool" form.

import { confirmationEmail } from './emails.js';
import { sendEmail } from './resend.js';

export function siteUrl(env) {
  return (env.SITE_URL || 'https://neatsize.com').replace(/\/+$/, '');
}

/** Returns true when Resend accepted the email. */
export async function sendConfirmation(env, { email, confirmToken, request }) {
  const confirmUrl = `${siteUrl(env)}/api/confirm?token=${confirmToken}`;
  const message = confirmationEmail({ confirmUrl, request });
  try {
    // Keyed on the token: a retried request never sends the same link twice.
    await sendEmail(env, { to: email, ...message }, `confirm-${confirmToken}`);
    return true;
  } catch (error) {
    console.error('confirmation email failed:', error.message);
    return false;
  }
}
