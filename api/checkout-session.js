import { stripe, PLANS, amountFor, siteUrl } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { plan, billing, name, email, handle, instagram } = req.body || {};
    if (!PLANS[plan]) return res.status(400).json({ error: 'Unknown plan' });
    const SITE = siteUrl(req);

    let mode, line_items;
    if (process.env.STRIPE_PRICE_ID) {
      // Use an existing Stripe Price (e.g. the 1€ product) for every checkout.
      const priceObj = await stripe.prices.retrieve(process.env.STRIPE_PRICE_ID);
      mode = priceObj.recurring ? 'subscription' : 'payment';
      line_items = [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }];
    } else {
      mode = billing === 'sub' ? 'subscription' : 'payment';
      line_items = [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amountFor(plan, billing),
          product_data: { name: `Brasero — ${PLANS[plan].name} pack` },
          ...(mode === 'subscription' ? { recurring: { interval: 'month' } } : {}),
        },
      }];
    }

    const session = await stripe.checkout.sessions.create({
      mode,
      customer_email: email || undefined,
      line_items,
      success_url: `${SITE}/onboarding.html?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/checkout.html?plan=${plan}&billing=${billing}`,
      metadata: { plan, billing, name: name || '', email: email || '', handle: handle || '', instagram: instagram || '' },
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create checkout session' });
  }
}
