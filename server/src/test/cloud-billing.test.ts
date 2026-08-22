import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Hono } from 'hono';
import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { makeCloudApp } from '../cloud/app.js';
import { Registry } from '../cloud/registry.js';
import { makeStripeGateway, type StripeGateway } from '../cloud/stripe.js';
import { ReefFleet } from '../cloud/tenants.js';

const BASE_DOMAIN = 'reef.test';
const APP_HOST = `app.${BASE_DOMAIN}`;
const APP_URL = `http://${APP_HOST}`;

interface FakeSession {
  id: string;
  priceId: string;
  customerId: string | null;
  subscriptionId: string | null;
  paymentStatus: string;
}

/** In-memory Stripe: webhook "signature" is the literal string 'valid'. */
class FakeStripe implements StripeGateway {
  sessions = new Map<string, FakeSession>();
  customerMetadata = new Map<string, Record<string, string>>();
  created: { priceId: string; successUrl: string; cancelUrl: string }[] = [];
  private counter = 0;

  async createCheckoutSession(opts: { priceId: string; successUrl: string; cancelUrl: string }) {
    this.created.push(opts);
    const id = `cs_test_${++this.counter}`;
    this.sessions.set(id, { id, priceId: opts.priceId, customerId: null, subscriptionId: null, paymentStatus: 'unpaid' });
    return { id, url: `https://checkout.stripe.test/${id}` };
  }

  completePayment(sessionId: string, customerId: string, subscriptionId: string): void {
    const session = this.sessions.get(sessionId)!;
    session.customerId = customerId;
    session.subscriptionId = subscriptionId;
    session.paymentStatus = 'paid';
  }

  async retrieveCheckoutSession(id: string) {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`no such session ${id}`);
    return session;
  }

  async updateCustomerMetadata(customerId: string, metadata: Record<string, string>) {
    this.customerMetadata.set(customerId, { ...this.customerMetadata.get(customerId), ...metadata });
  }

  async getCustomerMetadata(customerId: string) {
    return this.customerMetadata.get(customerId) ?? {};
  }

  async getCustomerEmail(customerId: string) {
    return customerId ? `${customerId}@customer.test` : null;
  }

  async createBillingPortalSession() {
    return { url: 'https://portal.stripe.test/session' };
  }

  verifyWebhook(payload: string, signatureHeader: string) {
    if (signatureHeader !== 'valid') throw new Error('bad signature');
    return JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } };
  }
}

interface BillingTestContext {
  app: Hono;
  registry: Registry;
  fleet: ReefFleet;
  stripe: FakeStripe;
  scratch: string;
  sentMail: { to: string; subject: string; text: string }[];
}

function makeBillingTestContext(): BillingTestContext {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'nemomemo-billing-test-'));
  const base = loadConfig({ dataDir: scratch, webDistDir: null });
  const registry = new Registry(path.join(scratch, 'registry.db'));
  const reefsDir = path.join(scratch, 'reefs');
  const fleet = new ReefFleet(base, reefsDir, 64, {
    maxMembers: 2,
    maxStorageBytes: 10 * 1024,
  });
  const stripe = new FakeStripe();
  const sentMail: { to: string; subject: string; text: string }[] = [];
  const app = makeCloudApp(registry, fleet, { baseDomain: BASE_DOMAIN, appHost: APP_HOST }, {
    registry,
    fleet,
    gateway: stripe,
    appUrl: APP_URL,
    baseDomain: BASE_DOMAIN,
    cancelUrl: 'https://cancel.test/pricing',
    prices: { month: 'price_month', year: 'price_year' },
    reefsDir,
    mailer: { send: async (message) => void sentMail.push(message) },
  });
  return { app, registry, fleet, stripe, scratch, sentMail };
}

async function postWebhook(ctx: BillingTestContext, event: unknown, signature = 'valid'): Promise<Response> {
  return ctx.app.request(`${APP_URL}/cloud/webhook/stripe`, {
    method: 'POST',
    headers: { host: APP_HOST, 'stripe-signature': signature, 'content-type': 'application/json' },
    body: JSON.stringify(event),
  });
}

async function postClaim(ctx: BillingTestContext, fields: Record<string, string>): Promise<Response> {
  return ctx.app.request(`${APP_URL}/cloud/claim`, {
    method: 'POST',
    headers: { host: APP_HOST, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
}

/** Runs checkout + paid webhook; returns the raw claim token. */
async function payAndProvision(ctx: BillingTestContext, customerId = 'cus_1'): Promise<string> {
  const checkout = await ctx.app.request(`${APP_URL}/cloud/checkout?interval=month`, {
    headers: { host: APP_HOST },
  });
  expect(checkout.status).toBe(303);
  const sessionId = checkout.headers.get('location')!.split('/').pop()!;
  ctx.stripe.completePayment(sessionId, customerId, 'sub_1');
  const hook = await postWebhook(ctx, {
    type: 'checkout.session.completed',
    data: { object: { customer: customerId, subscription: 'sub_1', metadata: { app: 'nemomemo-cloud' } } },
  });
  expect(hook.status).toBe(200);
  const claimUrl = ctx.stripe.customerMetadata.get(customerId)!.nemomemo_claim_url!;
  return new URL(claimUrl).searchParams.get('token')!;
}

describe('cloud billing + claim flow', () => {
  let ctx: BillingTestContext;

  beforeEach(() => {
    ctx = makeBillingTestContext();
  });

  afterEach(() => {
    ctx.fleet.closeAll();
    ctx.registry.close();
    fs.rmSync(ctx.scratch, { recursive: true, force: true });
  });

  it('checkout redirects to Stripe with the right price', async () => {
    const month = await ctx.app.request(`${APP_URL}/cloud/checkout?interval=month`, { headers: { host: APP_HOST } });
    expect(month.status).toBe(303);
    const year = await ctx.app.request(`${APP_URL}/cloud/checkout?interval=year`, { headers: { host: APP_HOST } });
    expect(year.status).toBe(303);
    expect(ctx.stripe.created.map((s) => s.priceId)).toEqual(['price_month', 'price_year']);
    expect(ctx.stripe.created[0]!.successUrl).toBe(`${APP_URL}/claim?session_id={CHECKOUT_SESSION_ID}`);

    const bad = await ctx.app.request(`${APP_URL}/cloud/checkout?interval=weekly`, { headers: { host: APP_HOST } });
    expect(bad.status).toBe(400);
  });

  it('checkout is rate limited per IP', async () => {
    for (let i = 0; i < 10; i++) {
      const response = await ctx.app.request(`${APP_URL}/cloud/checkout?interval=month`, {
        headers: { host: APP_HOST, 'cf-connecting-ip': '203.0.113.7' },
      });
      expect(response.status).toBe(303);
    }
    const limited = await ctx.app.request(`${APP_URL}/cloud/checkout?interval=month`, {
      headers: { host: APP_HOST, 'cf-connecting-ip': '203.0.113.7' },
    });
    expect(limited.status).toBe(429);
    const otherIp = await ctx.app.request(`${APP_URL}/cloud/checkout?interval=month`, {
      headers: { host: APP_HOST, 'cf-connecting-ip': '198.51.100.9' },
    });
    expect(otherIp.status).toBe(303);
  });

  it('emails the claim link to the buyer and dunning on failed payment', async () => {
    const token = await payAndProvision(ctx);
    const claimMail = ctx.sentMail.find((m) => m.to === 'cus_1@customer.test' && /claim/i.test(m.subject));
    expect(claimMail).toBeTruthy();
    expect(claimMail!.text).toContain(token);

    await postClaim(ctx, { token, slug: 'lagoon', email: 'keeper@claim.test', username: 'nemo', password: 'password123' });
    ctx.sentMail.length = 0;
    const hook = await postWebhook(ctx, {
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1', subscription: 'sub_1' } },
    });
    expect(hook.status).toBe(200);
    expect(ctx.sentMail.some((m) => m.to === 'cus_1@customer.test' && /payment/i.test(m.subject))).toBe(true);
  });

  it('claim form asks for at least 8 password characters', async () => {
    const token = await payAndProvision(ctx);
    const form = await ctx.app.request(`${APP_URL}/claim?token=${token}`, { headers: { host: APP_HOST } });
    expect(form.status).toBe(200);
    expect(await form.text()).toContain('minlength="8"');
  });

  it('paid checkout provisions exactly one reef and a working claim link, idempotently', async () => {
    const token = await payAndProvision(ctx);

    const reefs = ctx.registry.listReefs();
    expect(reefs).toHaveLength(1);
    expect(reefs[0]!.status).toBe('provisioned');
    expect(reefs[0]!.slug).toMatch(/^pending-/);
    expect(reefs[0]!.stripeCustomerId).toBe('cus_1');

    // Duplicate webhook delivery must not create a second reef or rotate the token.
    await postWebhook(ctx, {
      type: 'checkout.session.completed',
      data: { object: { customer: 'cus_1', subscription: 'sub_1', metadata: { app: 'nemomemo-cloud' } } },
    });
    expect(ctx.registry.listReefs()).toHaveLength(1);

    const form = await ctx.app.request(`${APP_URL}/claim?token=${token}`, { headers: { host: APP_HOST } });
    expect(form.status).toBe(200);
    expect(await form.text()).toContain('Pick your reef');

    // The success-page path (session_id) lands on the same claim, same reef.
    const viaSession = await ctx.app.request(`${APP_URL}/claim?session_id=cs_test_1`, { headers: { host: APP_HOST } });
    expect(viaSession.status).toBe(200);
    expect(await viaSession.text()).toContain(token);
    expect(ctx.registry.listReefs()).toHaveLength(1);
  });

  it('claim renames the reef, creates the admin, and the reef works', async () => {
    const token = await payAndProvision(ctx);
    const pendingSlug = ctx.registry.listReefs()[0]!.slug;

    // The placeholder reef was visited pre-claim, so its data dir exists.
    await ctx.app.request(`http://${pendingSlug}.${BASE_DOMAIN}/api/v1/instance/profile`, {
      headers: { host: `${pendingSlug}.${BASE_DOMAIN}` },
    });
    expect(fs.existsSync(path.join(ctx.scratch, 'reefs', pendingSlug))).toBe(true);

    const claimed = await postClaim(ctx, {
      token,
      slug: 'lagoon',
      email: 'keeper@claim.test', username: 'nemo',
      password: 'password123',
    });
    expect(claimed.status).toBe(200);
    expect(await claimed.text()).toContain('lagoon.reef.test');

    const reef = ctx.registry.getReefBySlug('lagoon')!;
    expect(reef.status).toBe('active');
    expect(ctx.registry.getReefBySlug(pendingSlug)).toBeNull();
    expect(fs.existsSync(path.join(ctx.scratch, 'reefs', 'lagoon'))).toBe(true);
    expect(fs.existsSync(path.join(ctx.scratch, 'reefs', pendingSlug))).toBe(false);

    // The first account is the admin, and signin works on the reef host.
    const signin = await ctx.app.request(`http://lagoon.${BASE_DOMAIN}/api/v1/auth/signin`, {
      method: 'POST',
      headers: { host: `lagoon.${BASE_DOMAIN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'nemo', password: 'password123' }),
    });
    expect(signin.status).toBe(200);
    expect(((await signin.json()) as { user: { role: string } }).user.role).toBe('ADMIN');

    // Re-submitting the burned token (double-click, refresh) is friendly, not
    // scary: it points at the already-live reef instead of erroring.
    const reuse = await postClaim(ctx, { token, slug: 'other', email: 'keeper@claim.test', username: 'x', password: 'password123' });
    expect(reuse.status).toBe(200);
    expect(await reuse.text()).toContain('already claimed');
    expect(ctx.registry.getReefBySlug('other')).toBeNull();

    // Same for revisiting the claim page.
    const revisit = await ctx.app.request(`${APP_URL}/claim?token=${token}`, { headers: { host: APP_HOST } });
    expect(revisit.status).toBe(200);
    expect(await revisit.text()).toContain('lagoon.reef.test');
  });

  it('claim rejects taken, reserved, and malformed slugs without burning the token', async () => {
    ctx.registry.createReef('coral', { status: 'active' });
    const token = await payAndProvision(ctx);

    const taken = await postClaim(ctx, { token, slug: 'coral', email: 'keeper@claim.test', username: 'nemo', password: 'password123' });
    expect(taken.status).toBe(409);
    const reserved = await postClaim(ctx, { token, slug: 'app', email: 'keeper@claim.test', username: 'nemo', password: 'password123' });
    expect(reserved.status).toBe(400);
    const malformed = await postClaim(ctx, { token, slug: 'Not A Slug', email: 'keeper@claim.test', username: 'nemo', password: 'password123' });
    expect(malformed.status).toBe(400);
    const shortPassword = await postClaim(ctx, { token, slug: 'lagoon', email: 'keeper@claim.test', username: 'nemo', password: 'shrt' });
    expect(shortPassword.status).toBe(400);

    // Still claimable after all those mistakes.
    const ok = await postClaim(ctx, { token, slug: 'lagoon', email: 'keeper@claim.test', username: 'nemo', password: 'password123' });
    expect(ok.status).toBe(200);
  });

  it('subscription lifecycle: payment failure, recovery, and cancellation', async () => {
    const token = await payAndProvision(ctx);
    await postClaim(ctx, { token, slug: 'lagoon', email: 'keeper@claim.test', username: 'nemo', password: 'password123' });
    const host = `lagoon.${BASE_DOMAIN}`;

    await postWebhook(ctx, { type: 'invoice.payment_failed', data: { object: { customer: 'cus_1' } } });
    expect(ctx.registry.getReefBySlug('lagoon')!.status).toBe('past_due');
    // Past-due reefs still serve (banner + grace handling is cloud UX, phase 3).
    const during = await ctx.app.request(`http://${host}/api/v1/instance/profile`, { headers: { host } });
    expect(during.status).toBe(200);

    await postWebhook(ctx, { type: 'invoice.paid', data: { object: { customer: 'cus_1' } } });
    expect(ctx.registry.getReefBySlug('lagoon')!.status).toBe('active');

    await postWebhook(ctx, {
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', customer: 'cus_1' } },
    });
    expect(ctx.registry.getReefBySlug('lagoon')!.status).toBe('suspended');
    const suspended = await ctx.app.request(`http://${host}/api/v1/instance/profile`, { headers: { host } });
    expect(suspended.status).toBe(403);
  });

  it("other products' events on the shared Stripe account never touch reefs", async () => {
    const token = await payAndProvision(ctx);
    await postClaim(ctx, { token, slug: 'lagoon', email: 'keeper@claim.test', username: 'nemo', password: 'password123' });

    // A different product's checkout (no app tag) must not provision a reef.
    await postWebhook(ctx, {
      type: 'checkout.session.completed',
      data: { object: { customer: 'cus_sytepro', subscription: 'sub_sytepro' } },
    });
    expect(ctx.registry.listReefs()).toHaveLength(1);
    expect(ctx.registry.getReefByStripeCustomerId('cus_sytepro')).toBeNull();

    // The reef's customer cancels a DIFFERENT product's subscription: reef unharmed.
    await postWebhook(ctx, {
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_other_product', customer: 'cus_1' } },
    });
    expect(ctx.registry.getReefBySlug('lagoon')!.status).toBe('active');

    // A failed invoice for another product's subscription: reef unharmed.
    await postWebhook(ctx, {
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1', subscription: 'sub_other_product' } },
    });
    expect(ctx.registry.getReefBySlug('lagoon')!.status).toBe('active');

    // But its own subscription's failed invoice still bites (newer parent shape).
    await postWebhook(ctx, {
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1', parent: { subscription_details: { subscription: 'sub_1' } } } },
    });
    expect(ctx.registry.getReefBySlug('lagoon')!.status).toBe('past_due');
  });

  it('rejects webhooks with bad signatures', async () => {
    const response = await postWebhook(ctx, { type: 'checkout.session.completed', data: { object: {} } }, 'forged');
    expect(response.status).toBe(400);
    expect(ctx.registry.listReefs()).toHaveLength(0);
  });

  it('unpaid checkout sessions cannot reach the claim form', async () => {
    const checkout = await ctx.app.request(`${APP_URL}/cloud/checkout?interval=month`, { headers: { host: APP_HOST } });
    const sessionId = checkout.headers.get('location')!.split('/').pop()!;
    const page = await ctx.app.request(`${APP_URL}/claim?session_id=${sessionId}`, { headers: { host: APP_HOST } });
    expect(page.status).toBe(402);
    expect(ctx.registry.listReefs()).toHaveLength(0);
  });

  it('the app host serves the landing page with both checkout buttons', async () => {
    const landing = await ctx.app.request(`${APP_URL}/`, { headers: { host: APP_HOST } });
    expect(landing.status).toBe(200);
    const html = await landing.text();
    expect(html).toContain('$1.99 / month');
    expect(html).toContain('$19 / year');
  });

  it('reef-host billing API: admin sees status + portal, others are refused', async () => {
    const token = await payAndProvision(ctx);
    await postClaim(ctx, { token, slug: 'lagoon', email: 'keeper@claim.test', username: 'nemo', password: 'password123' });
    const host = `lagoon.${BASE_DOMAIN}`;

    const signin = await ctx.app.request(`http://${host}/api/v1/auth/signin`, {
      method: 'POST',
      headers: { host, 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'nemo', password: 'password123' }),
    });
    const adminCookie = signin.headers.get('set-cookie')!.split(';')[0]!;

    const anonymous = await ctx.app.request(`http://${host}/api/v1/cloud/billing`, { headers: { host } });
    expect(anonymous.status).toBe(403);

    const billing = await ctx.app.request(`http://${host}/api/v1/cloud/billing`, {
      headers: { host, cookie: adminCookie },
    });
    expect(billing.status).toBe(200);
    const info = (await billing.json()) as { status: string; limits: { maxMembers: number } };
    expect(info.status).toBe('active');
    expect(info.limits.maxMembers).toBe(2);

    const portal = await ctx.app.request(`http://${host}/api/v1/cloud/billing/portal`, {
      method: 'POST',
      headers: { host, cookie: adminCookie },
    });
    expect(portal.status).toBe(200);
    expect(((await portal.json()) as { url: string }).url).toContain('portal.stripe.test');

    // A regular member is not a reefkeeper.
    const memberSignup = await ctx.app.request(`http://${host}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { host, 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'guppy', email: 'guppy@test.reef', password: 'password123' }),
    });
    expect(memberSignup.status).toBe(200);
    const memberCookie = memberSignup.headers.get('set-cookie')!.split(';')[0]!;
    const memberTry = await ctx.app.request(`http://${host}/api/v1/cloud/billing`, {
      headers: { host, cookie: memberCookie },
    });
    expect(memberTry.status).toBe(403);
  });

  it('fair-use brakes: member cap and storage cap bind on cloud reefs only', async () => {
    const token = await payAndProvision(ctx);
    await postClaim(ctx, { token, slug: 'lagoon', email: 'keeper@claim.test', username: 'nemo', password: 'password123' });
    const host = `lagoon.${BASE_DOMAIN}`;
    const signupOn = (username: string) =>
      ctx.app.request(`http://${host}/api/v1/auth/signup`, {
        method: 'POST',
        headers: { host, 'content-type': 'application/json' },
        body: JSON.stringify({ username, email: `${username}@test.reef`, password: 'password123' }),
      });

    // maxMembers = 2: the admin + one more, then the reef is full.
    expect((await signupOn('guppy')).status).toBe(200);
    const third = await signupOn('too-many');
    expect(third.status).toBe(403);
    expect(JSON.stringify(await third.json())).toContain('capacity');

    // maxStorageBytes = 10 KiB: an 11 KiB upload is refused, a small one is fine.
    const signin = await ctx.app.request(`http://${host}/api/v1/auth/signin`, {
      method: 'POST',
      headers: { host, 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'nemo', password: 'password123' }),
    });
    const cookie = signin.headers.get('set-cookie')!.split(';')[0]!;
    const upload = (name: string, bytes: number) => {
      const form = new FormData();
      form.append('file', new File([new Uint8Array(bytes)], name, { type: 'application/octet-stream' }));
      return ctx.app.request(`http://${host}/api/v1/attachments`, {
        method: 'POST',
        headers: { host, cookie },
        body: form,
      });
    };
    expect((await upload('small.bin', 1024)).status).toBe(201);
    const over = await upload('big.bin', 11 * 1024);
    expect(over.status).toBe(400);
    expect(JSON.stringify(await over.json())).toContain('storage is full');
  });

  it('the real gateway verifies genuine Stripe signatures and rejects forgeries', () => {
    const secret = 'whsec_test_secret';
    const gateway = makeStripeGateway('sk_test_dummy', secret);
    const payload = JSON.stringify({ type: 'invoice.paid', data: { object: { customer: 'cus_9' } } });
    const stripe = new Stripe('sk_test_dummy');
    const goodHeader = stripe.webhooks.generateTestHeaderString({ payload, secret });

    const event = gateway.verifyWebhook(payload, goodHeader);
    expect(event.type).toBe('invoice.paid');

    const forgedHeader = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_wrong' });
    expect(() => gateway.verifyWebhook(payload, forgedHeader)).toThrow();
  });
});
