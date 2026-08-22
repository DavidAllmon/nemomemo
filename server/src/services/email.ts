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
