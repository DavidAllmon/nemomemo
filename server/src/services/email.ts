import type { SmtpConfig } from '../config.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Sends mail. Injected everywhere (like StripeGateway) so tests use a fake. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Real SMTP mailer (nodemailer), built only when all NEMOMEMO_SMTP_* are set. */
export function makeSmtpMailer(smtp: SmtpConfig): Mailer {
  // Lazy import keeps nodemailer out of instances that never send mail.
  const transportPromise = import('nodemailer').then(({ default: nodemailer }) =>
    nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    }),
  );
  return {
    async send(message) {
      const transport = await transportPromise;
      await transport.sendMail({ from: smtp.from, ...message });
    },
  };
}

/** Fire-and-forget helper: request paths never block or fail on mail trouble. */
export function trySend(mailer: Mailer | null, message: MailMessage): void {
  if (!mailer) return;
  void mailer.send(message).catch((error) => {
    console.error('[email] send failed:', error instanceof Error ? error.message : error);
  });
}

export function welcomeMessage(instanceName: string, username: string, link: string): Omit<MailMessage, 'to'> {
  return {
    subject: `Welcome to ${instanceName}! 🐠`,
    text: `Hi ${username} — welcome to the reef!

Your ${instanceName} account is ready: jot thoughts, tag them, share them with your reef-mates, and hand the fleeting ones to Dory (she forgets them in 24 hours, it's her whole thing).

One little bubble to pop first — confirm your email so your account can always find its way back to you:

${link}

The link works for 7 days. If you didn't create this account, ignore this email and nothing happens.

Just keep swimming 🐠`,
  };
}

export function verifyEmailMessage(instanceName: string, username: string, link: string): Omit<MailMessage, 'to'> {
  return {
    subject: `Verify your email on ${instanceName}`,
    text: `Hi ${username}!

One little bubble to pop: confirm this is your email address so your ${instanceName} account can always find its way back to you.

${link}

This link works for 7 days. If you didn't create this account, you can ignore this email — nothing happens without the click.

Just keep swimming 🐠`,
  };
}

export function resetPasswordMessage(instanceName: string, username: string, link: string): Omit<MailMessage, 'to'> {
  return {
    subject: `Reset your ${instanceName} password`,
    text: `Hi ${username},

Someone (hopefully you) asked to reset your ${instanceName} password. Follow this link to pick a new one:

${link}

The link works for 1 hour and only once. If you didn't ask for this, ignore it — your password stays as it is.

Just keep swimming 🐠`,
  };
}

export function inviteMessage(
  instanceName: string,
  inviterName: string,
  username: string,
  link: string,
): Omit<MailMessage, 'to'> {
  return {
    subject: `You're invited to ${instanceName}! 🐠`,
    text: `Hi!

${inviterName} set up a spot for you on ${instanceName} — your username is "${username}". Pick a password and dive in:

${link}

The link works for 7 days. If you weren't expecting this, you can safely ignore it.

Just keep swimming 🐠`,
  };
}

export function passwordChangedMessage(instanceName: string, username: string): Omit<MailMessage, 'to'> {
  return {
    subject: `Your ${instanceName} password was changed`,
    text: `Hi ${username},

Your ${instanceName} password was just changed. If that was you — great, carry on!

If it wasn't you, reset your password right away from the sign-in page, and let your reefkeeper know.`,
  };
}

export function emailChangedMessage(instanceName: string, username: string, newEmail: string): Omit<MailMessage, 'to'> {
  return {
    subject: `Your ${instanceName} email address was changed`,
    text: `Hi ${username},

The email on your ${instanceName} account was just changed to ${newEmail}. If that was you — all good!

If it wasn't you, reset your password right away from the sign-in page, and let your reefkeeper know.`,
  };
}

export function claimLinkMessage(claimUrl: string): Omit<MailMessage, 'to'> {
  return {
    subject: 'Your NemoMemo reef is paid for — claim it! 🐠',
    text: `Thanks for joining NemoMemo Cloud!

Your reef is provisioned and waiting. Claim it here — pick your address, your username, and a password:

${claimUrl}

This link is also saved on your receipt's customer record, so it can always be recovered.

Just keep swimming 🐠`,
  };
}

export function dunningMessage(slug: string, baseDomain: string): Omit<MailMessage, 'to'> {
  return {
    subject: "A payment for your NemoMemo reef didn't make it through 🐡",
    text: `Hi!

The latest payment for your reef (${slug}.${baseDomain}) didn't go through — cards expire, banks hiccup, currents shift.

Your reef is still up. To keep it that way, update your payment method from Settings → Billing on your reef, or reply to this email and we'll help.

Just keep swimming 🐠`,
  };
}
