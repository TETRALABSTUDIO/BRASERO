import { stripe, PLANS, amountFor, siteUrl, saveOrder, stripePriceId } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { plan, billing, name, email, handle, instagram } = req.body || {};
    if (!PLANS[plan]) return res.status(400).json({ error: 'Unknown plan' });
    const SITE = siteUrl(req);

    let mode, line_items, amount;
    const priceId = stripePriceId(plan, billing) || process.env.STRIPE_PRICE_ID;
    if (priceId) {
      // Use the real Stripe Price for this plan + billing (or the legacy test price).
      const priceObj = await stripe.prices.retrieve(priceId);
      mode = priceObj.recurring ? 'subscription' : 'payment';
      amount = priceObj.unit_amount;
      line_items = [{ price: priceId, quantity: 1 }];
    } else {
      mode = billing === 'sub' ? 'subscription' : 'payment';
      amount = amountFor(plan, billing);
      line_items = [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amount,
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

    // Store the order (pending) — never let a DB error block checkout.
    try { await saveOrder({ stripe_session_id: session.id, status: 'pending', plan, billing, amount, name, email, instagram, handle }); }
    catch (e) { console.error('saveOrder failed', e); }

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create checkout session' });
  }
}
