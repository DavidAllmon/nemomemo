import Stripe from 'stripe';

/**
 * The few Stripe calls the cloud needs, behind an interface so billing logic
 * is testable without the network. The real implementation is a thin wrapper —
 * keep it logic-free.
 */
export interface StripeGateway {
  createCheckoutSession(opts: {
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ id: string; url: string }>;
  retrieveCheckoutSession(id: string): Promise<{
    id: string;
    customerId: string | null;
    subscriptionId: string | null;
    paymentStatus: string;
  }>;
  updateCustomerMetadata(customerId: string, metadata: Record<string, string>): Promise<void>;
  getCustomerMetadata(customerId: string): Promise<Record<string, string>>;
  getCustomerEmail(customerId: string): Promise<string | null>;
  createBillingPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }>;
  /** Throws on a bad signature. */
  verifyWebhook(payload: string, signatureHeader: string): StripeWebhookEvent;
}

export interface StripeWebhookEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

export function makeStripeGateway(secretKey: string, webhookSecret: string): StripeGateway {
  const stripe = new Stripe(secretKey);
  return {
    async createCheckoutSession({ priceId, successUrl, cancelUrl }) {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        // The Stripe account hosts several products; this tag is how the
        // webhook knows a session (and its subscription) belongs to NemoMemo.
        metadata: { app: 'nemomemo-cloud' },
        subscription_data: { metadata: { app: 'nemomemo-cloud' } },
      });
      if (!session.url) throw new Error('Stripe returned a checkout session without a URL');
      return { id: session.id, url: session.url };
    },
    async retrieveCheckoutSession(id) {
      const session = await stripe.checkout.sessions.retrieve(id);
      return {
        id: session.id,
        customerId: typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null),
        subscriptionId:
          typeof session.subscription === 'string' ? session.subscription : (session.subscription?.id ?? null),
        paymentStatus: session.payment_status,
      };
    },
    async updateCustomerMetadata(customerId, metadata) {
      await stripe.customers.update(customerId, { metadata });
    },
    async getCustomerMetadata(customerId) {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) return {};
      return (customer.metadata ?? {}) as Record<string, string>;
    },
    async getCustomerEmail(customerId) {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) return null;
      return customer.email ?? null;
    },
    async createBillingPortalSession(customerId, returnUrl) {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return { url: session.url };
    },
    verifyWebhook(payload, signatureHeader) {
      return stripe.webhooks.constructEvent(payload, signatureHeader, webhookSecret) as unknown as StripeWebhookEvent;
    },
  };
}
