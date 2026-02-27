/**
 * Billing Routes — Stripe Checkout, webhooks, portal, subscription management.
 */

import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { query } from '../db.js';
import { config } from '../config.js';

export const billingRouter = Router();

function getStripe(): Stripe | null {
  if (!config.stripe.secretKey) return null;
  return new Stripe(config.stripe.secretKey, { apiVersion: '2025-02-24.acacia' });
}

// ── POST /checkout — Create Stripe Checkout Session ─────────────────────────

billingRouter.post('/checkout', async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'Billing not configured' });

  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const { priceId, successUrl, cancelUrl } = req.body;
  if (!priceId) return res.status(400).json({ error: 'priceId required' });

  try {
    // Get or create Stripe customer
    const userResult = await query(
      'SELECT email, stripe_customer_id FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId },
      });
      customerId = customer.id;
      await query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, userId]);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || `${req.headers.origin || 'https://claudehistory.com'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${req.headers.origin || 'https://claudehistory.com'}/pricing`,
      metadata: { userId },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err: any) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ── GET /portal — Stripe Customer Portal ────────────────────────────────────

billingRouter.get('/portal', async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'Billing not configured' });

  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  try {
    const userResult = await query('SELECT stripe_customer_id FROM users WHERE id = $1', [userId]);
    const customerId = userResult.rows[0]?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: 'No billing account. Subscribe first.' });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${req.headers.origin || 'https://claudehistory.com'}/dashboard`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error('Portal error:', err.message);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// ── GET /status — Current subscription status ───────────────────────────────

billingRouter.get('/status', async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  try {
    const userResult = await query(
      'SELECT tier, stripe_customer_id, stripe_subscription_id FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const limits = config.tierLimits[user.tier] || config.tierLimits.free;
    const countResult = await query(
      'SELECT COUNT(*)::int AS cnt FROM knowledge_entries WHERE user_id = $1',
      [userId]
    );

    res.json({
      tier: user.tier,
      hasSubscription: !!user.stripe_subscription_id,
      usage: {
        knowledgeEntries: countResult.rows[0]?.cnt || 0,
        limit: limits.knowledgeEntries,
      },
      limits,
    });
  } catch (err: any) {
    console.error('Status error:', err.message);
    res.status(500).json({ error: 'Failed to get billing status' });
  }
});

// ── POST /webhook — Stripe Webhook Handler ──────────────────────────────────

billingRouter.post('/webhook', async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'Billing not configured' });

  const sig = req.headers['stripe-signature'] as string;
  if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (!userId) break;

        // Get subscription to determine tier from price
        const subscriptionId = session.subscription as string;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = subscription.items.data[0]?.price?.id;
          const tier = mapPriceToTier(priceId);

          await query(
            'UPDATE users SET tier = $1, stripe_subscription_id = $2 WHERE id = $3',
            [tier, subscriptionId, userId]
          );
          console.log(`User ${userId} upgraded to ${tier}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price?.id;
        const tier = mapPriceToTier(priceId);
        const status = subscription.status;

        if (status === 'active' || status === 'trialing') {
          await query(
            'UPDATE users SET tier = $1 WHERE stripe_customer_id = $2',
            [tier, customerId]
          );
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        await query(
          "UPDATE users SET tier = 'free', stripe_subscription_id = NULL WHERE stripe_customer_id = $1",
          [customerId]
        );
        console.log(`Customer ${customerId} downgraded to free`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        console.warn(`Payment failed for customer ${customerId}`);
        // Could send email notification here
        break;
      }

      default:
        // Unhandled event type — that's fine
        break;
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error('Webhook processing error:', err.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Map a Stripe price ID to our internal tier name.
 * Set these as env vars: STRIPE_PRICE_PRO, STRIPE_PRICE_TEAM
 */
function mapPriceToTier(priceId: string | undefined): string {
  if (!priceId) return 'free';
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro';
  if (priceId === process.env.STRIPE_PRICE_TEAM) return 'team';
  // Fallback: check price metadata or default to pro
  return 'pro';
}
