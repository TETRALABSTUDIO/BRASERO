import { stripe, PLANS, amountFor, siteUrl, saveOrder, stripePriceId, addonLineItems, addonKeys, ITEMS } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { plan, billing, name, email, handle, instagram, addon_ref, addons, addon_item } = req.body || {};
    const SITE = siteUrl(req);

    // Tracker upsell: add one catalogue item (carousels / stories / branding) to an existing order.
    if (addon_ref && addon_item && ITEMS[addon_item]) {
      const it = ITEMS[addon_item];
      const ar = encodeURIComponent(addon_ref), em = encodeURIComponent(email || '');
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: email || undefined,
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: it.amount, product_data: { name: `Brasero — ${it.name}` } } }],
        success_url: `${SITE}/track.html?ref=${ar}&email=${em}&addon=1`,
        cancel_url: `${SITE}/track.html?ref=${ar}&email=${em}`,
        metadata: { addon_ref, addon_item, email: email || '' },
      });
      return res.json({ url: session.url });
    }

    if (!PLANS[plan]) return res.status(400).json({ error: 'Unknown plan' });
    const isAddon = !!addon_ref;   // buying extra decks for an existing order
    const addOns = addonKeys(addons);   // upsell add-ons selected at checkout

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

    line_items = [...line_items, ...addonLineItems(addOns)];

    const ar = encodeURIComponent(addon_ref || ''), em = encodeURIComponent(email || '');
    const session = await stripe.checkout.sessions.create({
      mode,
      customer_email: email || undefined,
      line_items,
      success_url: isAddon
        ? `${SITE}/track.html?ref=${ar}&email=${em}&addon=1`
        : `${SITE}/onboarding.html?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: isAddon
        ? `${SITE}/track.html?ref=${ar}&email=${em}`
        : `${SITE}/checkout.html?plan=${plan}&billing=${billing}`,
      metadata: { plan, billing, name: name || '', email: email || '', handle: handle || '', instagram: instagram || '', addon_ref: addon_ref || '', addons: addOns.join(',') },
    });

    // For a brand-new order, store it (pending). Add-ons attach to an existing
    // order in the webhook, so they don't create a separate order row.
    if (!isAddon) {
      try { await saveOrder({ stripe_session_id: session.id, status: 'pending', plan, billing, amount, name, email, instagram, handle }); }
      catch (e) { console.error('saveOrder failed', e); }
    }

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create checkout session' });
  }
}
