import { signupRequestSchema } from '@nemomemo/shared';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { customAlphabet } from 'nanoid';
import { nowSeconds } from '../lib/time.js';
import { resolveSessionViewer, SESSION_COOKIE } from '../middleware/auth.js';
import { makeRateLimiter } from '../middleware/rate-limit.js';
import { REEF_SLUG_RE, RESERVED_SLUGS, type ReefRow, type Registry } from './registry.js';
import { claimLinkMessage, dunningMessage, trySend, type Mailer } from '../services/email.js';
import type { StripeGateway, StripeWebhookEvent } from './stripe.js';
import type { ReefFleet, ReefHandle } from './tenants.js';

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
  /** Platform mailer (claim links, dunning); null when SMTP env is unset. */
  mailer: Mailer | null;
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
  .progress{margin-top:1.2rem}
  .progress .track{height:.55rem;border-radius:99px;background:#e0f2fe;overflow:hidden}
  .progress .fish{height:100%;width:35%;border-radius:99px;background:#0284c7;animation:swim 1.6s ease-in-out infinite}
  .progress p{font-size:.9rem;color:#0369a1;margin:.6rem 0 0}
  @keyframes swim{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
  @media (prefers-reduced-motion: reduce){.progress .fish{animation:none;width:100%}}
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
    if (!existing.stripeSubscriptionId && subscriptionId) {
      deps.registry.updateReefSubscription(existing.id, subscriptionId);
    }
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
  // The claim link lives in three places: on-screen, in Stripe customer
  // metadata (dashboard recovery), and — when SMTP is up — in the buyer's inbox.
  await deps.gateway.updateCustomerMetadata(customerId, { nemomemo_claim_url: claimUrl });
  if (deps.mailer) {
    const email = await deps.gateway.getCustomerEmail(customerId).catch(() => null);
    if (email) trySend(deps.mailer, { to: email, ...claimLinkMessage(claimUrl) });
  }
  return { reef, claimUrl };
}

function alreadyClaimedPage(deps: BillingDeps, slug: string): string {
  const host = `${escapeHtml(slug)}.${escapeHtml(deps.baseDomain)}`;
  return page(
    'Your reef is ready',
    `<div style="font-size:2.5rem">🐠</div><h1>Good news — this reef is already claimed!</h1>
<p>Your reef is live at <strong><a href="https://${host}">${host}</a></strong>. Swim over and sign in with the reefkeeper account you created.</p>`,
  );
}

function claimFormHtml(deps: BillingDeps, token: string, opts: { claimUrl?: string; error?: string; email?: string } = {}): string {
  return page(
    'Claim your reef',
    `<div style="font-size:2.5rem">🐠</div><h1>Your reef is paid for — time to claim it!</h1>
${opts.claimUrl ? `<p>Save this link in case you drift away (it's also on your Stripe receipt's customer record):</p><p class="link">${escapeHtml(opts.claimUrl)}</p>` : ''}
${opts.error ? `<p class="err">${escapeHtml(opts.error)}</p>` : ''}
<form method="post" action="/cloud/claim" id="claim-form">
  <input type="hidden" name="token" value="${escapeHtml(token)}">
  <label for="slug">Pick your reef's address</label>
  <div class="slug"><input id="slug" name="slug" required pattern="[a-z0-9][a-z0-9-]*" placeholder="coral" autocapitalize="none"><span>.${escapeHtml(deps.baseDomain)}</span></div>
  <label for="email">Your email (for account recovery)</label>
  <input id="email" name="email" type="email" required value="${escapeHtml(opts.email ?? '')}">
  <label for="username">Reefkeeper username</label>
  <input id="username" name="username" required autocapitalize="none">
  <label for="password">Password</label>
  <input id="password" name="password" type="password" required minlength="8">
  <button type="submit" id="claim-btn">Claim my reef</button>
</form>
<div class="progress" id="claim-progress" hidden>
  <div class="track"><div class="fish"></div></div>
  <p id="claim-progress-msg">Building your reef… don't close this page. 🐠</p>
</div>
<script>
(function () {
  var form = document.getElementById('claim-form');
  var btn = document.getElementById('claim-btn');
  var box = document.getElementById('claim-progress');
  var msg = document.getElementById('claim-progress-msg');
  var lines = [
    'Building your reef… don\\u2019t close this page. \\ud83d\\udc20',
    'Laying the coral foundations…',
    'Filling it with water (the good kind)…',
    'Setting up your reefkeeper account…',
    'Still working — big oceans take a moment…'
  ];
  var submitted = false;
  form.addEventListener('submit', function (event) {
    if (submitted) { event.preventDefault(); return; }
    submitted = true;
    btn.disabled = true;
    btn.textContent = 'Building your reef…';
    box.hidden = false;
    var i = 0;
    setInterval(function () { i = Math.min(i + 1, lines.length - 1); msg.textContent = lines[i]; }, 7000);
  });
})();
</script>`,
  );
}

/**
 * The Stripe account is shared with other products, so every handler must
 * prove an event is NemoMemo's before acting: checkout sessions carry an
 * `app` metadata tag, and subscription/invoice events must reference the
 * reef's own subscription — a customer may hold other products' subscriptions.
 */
function handleWebhookEvent(deps: BillingDeps, event: StripeWebhookEvent): Promise<void> | void {
  const object = event.data.object;
  const customerId = typeof object.customer === 'string' ? object.customer : null;
  const metadata = (object.metadata ?? {}) as Record<string, unknown>;

  switch (event.type) {
    case 'checkout.session.completed': {
      if (!customerId) return;
      if (metadata.app !== 'nemomemo-cloud') return;
      const subscriptionId = typeof object.subscription === 'string' ? object.subscription : null;
      return ensureProvisioned(deps, customerId, subscriptionId).then(() => undefined);
    }
    case 'invoice.payment_failed':
    case 'invoice.paid': {
      if (!customerId) return;
      const reef = deps.registry.getReefByStripeCustomerId(customerId);
      if (!reef) return;
      const parent = object.parent as { subscription_details?: { subscription?: unknown } } | undefined;
      const invoiceSub =
        typeof object.subscription === 'string'
          ? object.subscription
          : typeof parent?.subscription_details?.subscription === 'string'
            ? parent.subscription_details.subscription
            : null;
      if (reef.stripeSubscriptionId && invoiceSub && invoiceSub !== reef.stripeSubscriptionId) return;
      if (event.type === 'invoice.payment_failed' && reef.status === 'active') {
        deps.registry.setReefStatusById(reef.id, 'past_due');
        if (deps.mailer && customerId) {
          return deps.gateway
            .getCustomerEmail(customerId)
            .catch(() => null)
            .then((email) => {
              if (email) trySend(deps.mailer, { to: email, ...dunningMessage(reef.slug, deps.baseDomain) });
            });
        }
      } else if (event.type === 'invoice.paid' && reef.status === 'past_due') {
        deps.registry.setReefStatusById(reef.id, 'active');
      }
      return;
    }
    case 'customer.subscription.deleted': {
      if (!customerId) return;
      const reef = deps.registry.getReefByStripeCustomerId(customerId);
      if (!reef) return;
      const subId = typeof object.id === 'string' ? object.id : null;
      if (reef.stripeSubscriptionId && subId !== reef.stripeSubscriptionId) return;
      // Data is retained for the grace window; deletion is a separate, manual step.
      if (reef.status !== 'canceled') deps.registry.setReefStatusById(reef.id, 'suspended');
      return;
    }
    default:
      return;
  }
}

/**
 * Cloud-only API served on reef hosts (`/api/v1/cloud/*`), handled by the
 * outer router before the tenant app — the tenant app itself stays
 * cloud-unaware. The viewer is resolved against the reef's own database.
 */
export async function handleReefCloudApi(
  deps: BillingDeps,
  reef: ReefRow,
  handle: ReefHandle,
  c: Context,
): Promise<Response> {
  const pathname = new URL(c.req.url).pathname;
  const token = getCookie(c, SESSION_COOKIE);
  const viewer = token ? resolveSessionViewer(handle.db, token) : null;
  if (!viewer || viewer.user.role !== 'ADMIN') {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Reefkeeper access required' } }, 403);
  }

  if (c.req.method === 'GET' && pathname === '/api/v1/cloud/billing') {
    return c.json({
      status: reef.status,
      limits: handle.config.cloudLimits,
    });
  }

  if (c.req.method === 'POST' && pathname === '/api/v1/cloud/billing/portal') {
    if (!reef.stripeCustomerId) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'No billing on file for this reef' } }, 404);
    }
    const session = await deps.gateway.createBillingPortalSession(
      reef.stripeCustomerId,
      `https://${reef.slug}.${deps.baseDomain}/settings`,
    );
    return c.json({ url: session.url });
  }

  return c.json({ error: { code: 'NOT_FOUND', message: 'No such endpoint' } }, 404);
}

export function billingRoutes(deps: BillingDeps): Hono {
  const app = new Hono();

  app.get('/', (c) =>
    c.html(
      page(
        'Get your reef',
        `<div style="font-size:2.5rem">🐠</div><h1>NemoMemo Cloud</h1>
<p>Your own private reef — memos, members, and a Dory or two — hosted for you. Try the <a href="https://demo.trynemomemo.com">live demo</a> first, then dive in:</p>
<form method="get" action="/cloud/checkout"><input type="hidden" name="interval" value="month"><button type="submit">$1.99 / month</button></form>
<form method="get" action="/cloud/checkout"><input type="hidden" name="interval" value="year"><button type="submit" style="background:#0369a1">$19 / year — two months free</button></form>
<p style="font-size:.85rem;color:#0369a1">Pay first, claim your reef right after — no trial, no card UI of ours, all handled by Stripe. Lost your reef? Your claim link lives on your Stripe receipt's customer record.</p>`,
      ),
    ),
  );

  // Each hit creates a Stripe checkout session — don't let a loop mint thousands.
  const checkoutLimiter = makeRateLimiter({ scope: 'checkout', windowMs: 60_000, max: 10 });

  app.get('/cloud/checkout', checkoutLimiter, async (c) => {
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
      const email = (await deps.gateway.getCustomerEmail(session.customerId).catch(() => null)) ?? '';
      return c.html(claimFormHtml(deps, token, { claimUrl, email }));
    }

    if (rawToken) {
      const claim = deps.registry.getClaimToken(hashToken(rawToken));
      // A used token whose reef is live means the claim worked (maybe they
      // refreshed or came back) — celebrate, don't scare.
      if (claim?.usedTs != null) {
        const reef = deps.registry.getReefById(claim.reefId);
        if (reef && reef.status !== 'canceled' && !reef.slug.startsWith('pending-')) {
          return c.html(alreadyClaimedPage(deps, reef.slug));
        }
      }
      if (!claim || claim.usedTs != null || claim.expiresTs <= nowSeconds()) {
        return c.html(
          page('Link expired', `<h1>This claim link swam away 🐠</h1><p>If you already claimed your reef, sign in there. Otherwise contact support and we'll get you a fresh one.</p>`),
          404,
        );
      }
      const tokenReef = deps.registry.getReefById(claim.reefId);
      const email = tokenReef?.stripeCustomerId
        ? ((await deps.gateway.getCustomerEmail(tokenReef.stripeCustomerId).catch(() => null)) ?? '')
        : '';
      return c.html(claimFormHtml(deps, rawToken, { email }));
    }

    return c.html(page('Not found', `<h1>Nothing to claim here 🐙</h1><p>Follow the link from your checkout receipt.</p>`), 404);
  });

  app.post('/cloud/claim', async (c) => {
    const body = await c.req.parseBody();
    const rawToken = typeof body.token === 'string' ? body.token : '';
    const slug = typeof body.slug === 'string' ? body.slug.toLowerCase().trim() : '';
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';

    const claim = deps.registry.getClaimToken(hashToken(rawToken));
    // Double-submit / refresh after a successful claim: point at the live reef.
    if (claim?.usedTs != null) {
      const claimed = deps.registry.getReefById(claim.reefId);
      if (claimed && claimed.status !== 'canceled' && !claimed.slug.startsWith('pending-')) {
        return c.html(alreadyClaimedPage(deps, claimed.slug));
      }
    }
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
    const credentials = signupRequestSchema.safeParse({ username, password, email });
    if (!credentials.success) {
      return fail('Check your details: a real email, a username of 1–32 letters/numbers/hyphens, and a password of at least 8 characters.');
    }

    // Claim: rename the placeholder, activate, burn the token, then create the
    // first (admin) account through the reef's own signup route.
    const startedAt = Date.now();
    const oldSlug = reef.slug;
    deps.fleet.evict(oldSlug);
    const oldDir = path.join(deps.reefsDir, oldSlug);
    if (fs.existsSync(oldDir)) fs.renameSync(oldDir, path.join(deps.reefsDir, slug));
    deps.registry.renameReef(reef.id, slug);
    deps.registry.setReefStatusById(reef.id, 'active');
    deps.registry.markClaimTokenUsed(claim.id);

    const handle = deps.fleet.get(slug);
    // Give the internal request the reef's public identity so the welcome
    // email's verify link points at https://<slug>.<domain>, not nowhere.
    const signup = await handle.app.request('/api/v1/auth/signup', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: `${slug}.${deps.baseDomain}`,
        'x-forwarded-proto': 'https',
      },
      body: JSON.stringify(credentials.data),
    });
    if (signup.status !== 200) {
      console.error(`[cloud] first-admin signup failed for reef ${slug}: ${signup.status}`);
      return c.html(
        page('Something went sideways', `<h1>Your reef is ready, but the account hiccuped 🐡</h1><p>Head to <a href="https://${escapeHtml(slug)}.${escapeHtml(deps.baseDomain)}">${escapeHtml(slug)}.${escapeHtml(deps.baseDomain)}</a> and create the first account there.</p>`),
        500,
      );
    }

    console.log(`[cloud] reef ${slug} claimed in ${Date.now() - startedAt}ms`);
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
