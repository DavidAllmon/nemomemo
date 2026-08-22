import { signupRequestSchema } from '@nemomemo/shared';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { customAlphabet } from 'nanoid';
import { nowSeconds } from '../lib/time.js';
import { REEF_SLUG_RE, RESERVED_SLUGS, type ReefRow, type Registry } from './registry.js';
import type { StripeGateway, StripeWebhookEvent } from './stripe.js';
import type { ReefFleet } from './tenants.js';

const CLAIM_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const placeholderSlug = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

export interface BillingDeps {
  registry: Registry;
  fleet: ReefFleet;
  gateway: StripeGateway;
  /** e.g. https://app.trynemomemo.com — where checkout/claim pages live. */
  appUrl: string;
  /** Customer reefs live at https://<slug>.<baseDomain>. */
  baseDomain: string;
  /** Where a canceled checkout sends the customer back to. */
  cancelUrl: string;
  prices: { month: string; year: string };
  /** Where each reef's data lives; needed to move a dir when a slug is claimed. */
  reefsDir: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · NemoMemo Cloud</title>
<style>
  body{font-family:system-ui;margin:0;min-height:100vh;display:grid;place-items:center;background:#f0f9ff;color:#0c4a6e}
  main{max-width:26rem;padding:2rem;background:#fff;border-radius:1rem;box-shadow:0 8px 30px rgb(2 132 199 / .12);margin:1rem}
  h1{font-size:1.4rem} label{display:block;margin:.9rem 0 .25rem;font-weight:600;font-size:.9rem}
  input{width:100%;box-sizing:border-box;padding:.55rem;border:1px solid #bae6fd;border-radius:.5rem;font-size:1rem}
  .slug{display:flex;align-items:center;gap:.4rem} .slug span{color:#0369a1;white-space:nowrap}
  button{margin-top:1.2rem;width:100%;padding:.7rem;border:0;border-radius:.6rem;background:#0284c7;color:#fff;font-size:1rem;cursor:pointer}
  .err{background:#fef2f2;color:#b91c1c;padding:.6rem .8rem;border-radius:.5rem;margin-top:1rem}
  .link{word-break:break-all;background:#f0f9ff;padding:.6rem .8rem;border-radius:.5rem;font-size:.85rem}
  a{color:#0284c7}
</style></head><body><main>${body}</main></body></html>`;
}

/** Provision (or find) the reef for a paid checkout, idempotent per customer. */
async function ensureProvisioned(
  deps: BillingDeps,
  customerId: string,
  subscriptionId: string | null,
): Promise<{ reef: ReefRow; claimUrl: string }> {
  const existing = deps.registry.getReefByStripeCustomerId(customerId);
  if (existing) {
    const metadata = await deps.gateway.getCustomerMetadata(customerId);
    const claimUrl = metadata.nemomemo_claim_url;
    if (claimUrl) return { reef: existing, claimUrl };
    // Metadata lost somehow — mint a fresh claim token so the customer isn't stranded.
    const token = randomBytes(32).toString('base64url');
    deps.registry.createClaimToken(existing.id, hashToken(token), nowSeconds() + CLAIM_TOKEN_TTL_SECONDS);
    const freshUrl = `${deps.appUrl}/claim?token=${token}`;
    await deps.gateway.updateCustomerMetadata(customerId, { nemomemo_claim_url: freshUrl });
    return { reef: existing, claimUrl: freshUrl };
  }

  const reef = deps.registry.createReef(`pending-${placeholderSlug()}`, {
    status: 'provisioned',
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId ?? undefined,
  });
  const token = randomBytes(32).toString('base64url');
  deps.registry.createClaimToken(reef.id, hashToken(token), nowSeconds() + CLAIM_TOKEN_TTL_SECONDS);
  const claimUrl = `${deps.appUrl}/claim?token=${token}`;
  // No email in v1: the claim link lives on-screen and in Stripe customer
  // metadata so it can be recovered from the dashboard.
  await deps.gateway.updateCustomerMetadata(customerId, { nemomemo_claim_url: claimUrl });
  return { reef, claimUrl };
}

function claimFormHtml(deps: BillingDeps, token: string, opts: { claimUrl?: string; error?: string } = {}): string {
  return page(
    'Claim your reef',
    `<div style="font-size:2.5rem">🐠</div><h1>Your reef is paid for — time to claim it!</h1>
${opts.claimUrl ? `<p>Save this link in case you drift away (it's also on your Stripe receipt's customer record):</p><p class="link">${escapeHtml(opts.claimUrl)}</p>` : ''}
${opts.error ? `<p class="err">${escapeHtml(opts.error)}</p>` : ''}
<form method="post" action="/cloud/claim">
  <input type="hidden" name="token" value="${escapeHtml(token)}">
  <label for="slug">Pick your reef's address</label>
  <div class="slug"><input id="slug" name="slug" required pattern="[a-z0-9][a-z0-9-]*" placeholder="coral" autocapitalize="none"><span>.${escapeHtml(deps.baseDomain)}</span></div>
  <label for="username">Reefkeeper username</label>
  <input id="username" name="username" required autocapitalize="none">
  <label for="password">Password</label>
  <input id="password" name="password" type="password" required minlength="6">
  <button type="submit">Claim my reef</button>
</form>`,
  );
}

function handleWebhookEvent(deps: BillingDeps, event: StripeWebhookEvent): Promise<void> | void {
  const object = event.data.object;
  const customerId = typeof object.customer === 'string' ? object.customer : null;
  switch (event.type) {
    case 'checkout.session.completed': {
      if (!customerId) return;
      const subscriptionId = typeof object.subscription === 'string' ? object.subscription : null;
      return ensureProvisioned(deps, customerId, subscriptionId).then(() => undefined);
    }
    case 'invoice.payment_failed': {
      if (!customerId) return;
      const reef = deps.registry.getReefByStripeCustomerId(customerId);
      if (reef && reef.status === 'active') deps.registry.setReefStatusById(reef.id, 'past_due');
      return;
    }
    case 'invoice.paid': {
      if (!customerId) return;
      const reef = deps.registry.getReefByStripeCustomerId(customerId);
      if (reef && reef.status === 'past_due') deps.registry.setReefStatusById(reef.id, 'active');
      return;
    }
    case 'customer.subscription.deleted': {
      if (!customerId) return;
      const reef = deps.registry.getReefByStripeCustomerId(customerId);
      // Data is retained for the grace window; deletion is a separate, manual step.
      if (reef && reef.status !== 'canceled') deps.registry.setReefStatusById(reef.id, 'suspended');
      return;
    }
    default:
      return;
  }
}

export function billingRoutes(deps: BillingDeps): Hono {
  const app = new Hono();

  app.get('/cloud/checkout', async (c) => {
    const interval = c.req.query('interval') === 'year' ? 'year' : c.req.query('interval') === 'month' ? 'month' : null;
    if (!interval) {
      return c.json({ error: { code: 'INVALID_ARGUMENT', message: 'interval must be month or year' } }, 400);
    }
    const session = await deps.gateway.createCheckoutSession({
      priceId: deps.prices[interval],
      successUrl: `${deps.appUrl}/claim?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: deps.cancelUrl,
    });
    return c.redirect(session.url, 303);
  });

  app.post('/cloud/webhook/stripe', async (c) => {
    const signature = c.req.header('stripe-signature');
    if (!signature) return c.json({ error: { code: 'INVALID_ARGUMENT', message: 'Missing signature' } }, 400);
    let event: StripeWebhookEvent;
    try {
      event = deps.gateway.verifyWebhook(await c.req.text(), signature);
    } catch {
      return c.json({ error: { code: 'INVALID_ARGUMENT', message: 'Bad signature' } }, 400);
    }
    await handleWebhookEvent(deps, event);
    return c.json({ received: true });
  });

  app.get('/claim', async (c) => {
    const sessionId = c.req.query('session_id');
    const rawToken = c.req.query('token');

    if (sessionId) {
      const session = await deps.gateway.retrieveCheckoutSession(sessionId);
      if (session.paymentStatus === 'unpaid' || !session.customerId) {
        return c.html(
          page('Almost there', `<h1>That payment hasn't finished yet 🐡</h1><p>If you completed checkout, give it a moment and refresh — or reach out and we'll sort it out.</p>`),
          402,
        );
      }
      const { reef, claimUrl } = await ensureProvisioned(deps, session.customerId, session.subscriptionId);
      if (reef.status !== 'provisioned') {
        return c.html(
          page('Already claimed', `<h1>This reef is already claimed 🐚</h1><p>Swim over to <a href="https://${escapeHtml(reef.slug)}.${escapeHtml(deps.baseDomain)}">${escapeHtml(reef.slug)}.${escapeHtml(deps.baseDomain)}</a> and sign in.</p>`),
        );
      }
      const token = new URL(claimUrl).searchParams.get('token') ?? '';
      return c.html(claimFormHtml(deps, token, { claimUrl }));
    }

    if (rawToken) {
      const claim = deps.registry.getClaimToken(hashToken(rawToken));
      if (!claim || claim.usedTs != null || claim.expiresTs <= nowSeconds()) {
        return c.html(
          page('Link expired', `<h1>This claim link swam away 🐠</h1><p>If you already claimed your reef, sign in there. Otherwise contact support and we'll get you a fresh one.</p>`),
          404,
        );
      }
      return c.html(claimFormHtml(deps, rawToken));
    }

    return c.html(page('Not found', `<h1>Nothing to claim here 🐙</h1><p>Follow the link from your checkout receipt.</p>`), 404);
  });

  app.post('/cloud/claim', async (c) => {
    const body = await c.req.parseBody();
    const rawToken = typeof body.token === 'string' ? body.token : '';
    const slug = typeof body.slug === 'string' ? body.slug.toLowerCase().trim() : '';
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const claim = deps.registry.getClaimToken(hashToken(rawToken));
    if (!claim || claim.usedTs != null || claim.expiresTs <= nowSeconds()) {
      return c.html(page('Link expired', `<h1>This claim link swam away 🐠</h1><p>Contact support for a fresh one.</p>`), 404);
    }
    const reef = deps.registry.getReefById(claim.reefId);
    if (!reef || reef.status !== 'provisioned') {
      return c.html(page('Already claimed', `<h1>This reef is already claimed 🐚</h1>`), 409);
    }

    const fail = (error: string, status: 400 | 409 = 400) => c.html(claimFormHtml(deps, rawToken, { error }), status);

    if (!REEF_SLUG_RE.test(slug)) {
      return fail('Reef addresses are 1–40 lowercase letters, numbers, or hyphens (no leading/trailing hyphen).');
    }
    if (RESERVED_SLUGS.has(slug)) return fail('That address is reserved — pick another and keep swimming.');
    if (deps.registry.getReefBySlug(slug)) return fail('That reef address is already taken — try another.', 409);
    const credentials = signupRequestSchema.safeParse({ username, password });
    if (!credentials.success) {
      return fail('Username must be 1–32 letters, numbers, or hyphens; password at least 6 characters.');
    }

    // Claim: rename the placeholder, activate, burn the token, then create the
    // first (admin) account through the reef's own signup route.
    const oldSlug = reef.slug;
    deps.fleet.evict(oldSlug);
    const oldDir = path.join(deps.reefsDir, oldSlug);
    if (fs.existsSync(oldDir)) fs.renameSync(oldDir, path.join(deps.reefsDir, slug));
    deps.registry.renameReef(reef.id, slug);
    deps.registry.setReefStatusById(reef.id, 'active');
    deps.registry.markClaimTokenUsed(claim.id);

    const handle = deps.fleet.get(slug);
    const signup = await handle.app.request('/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(credentials.data),
    });
    if (signup.status !== 200) {
      console.error(`[cloud] first-admin signup failed for reef ${slug}: ${signup.status}`);
      return c.html(
        page('Something went sideways', `<h1>Your reef is ready, but the account hiccuped 🐡</h1><p>Head to <a href="https://${escapeHtml(slug)}.${escapeHtml(deps.baseDomain)}">${escapeHtml(slug)}.${escapeHtml(deps.baseDomain)}</a> and create the first account there.</p>`),
        500,
      );
    }

    const reefUrl = `https://${slug}.${deps.baseDomain}`;
    return c.html(
      page(
        'Welcome to your reef',
        `<div style="font-size:2.5rem">🎉🐠</div><h1>Your reef is ready!</h1>
<p><strong><a href="${escapeHtml(reefUrl)}">${escapeHtml(slug)}.${escapeHtml(deps.baseDomain)}</a></strong> is all yours.</p>
<p>Sign in there as <strong>${escapeHtml(username)}</strong> — you're the reefkeeper (admin). Invite your school of fish from Settings. Just keep swimming!</p>`,
      ),
    );
  });

  return app;
}
