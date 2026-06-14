import { stripe, PLANS, amountFor, siteUrl, saveOrder, stripePriceId, addonLineItems, addonKeys, ITEMS, cartItems, MODULES } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { plan, billing, name, email, handle, instagram, niche, addon_ref, addons, addon_item, mix, branding } = req.body || {};
    const SITE = siteUrl(req);

    // Tier formula ("compose your formula"): pack-priced (3 / 6 / 9+1), one-time payment.
    // Price = the chosen tier; `mix` is the content composition the client dragged (decks/
    // stories/statics) and only defines which deck rows to seed. Branding is an upsell
    // (+$210) on Ember/Flame, and INCLUDED free on Meteor (burst).
    if (plan && PLANS[plan] && mix && !addon_ref) {
      const content = {};
      for (const it of cartItems(mix)) if (it.type !== 'branding') content[it.key] = it.qty;
      const brandIncluded = plan === 'burst';
      const brandCharged = !!branding && !brandIncluded;          // only Ember/Flame pay for it
      const seedMix = { ...content, ...((brandIncluded || !!branding) ? { branding: 1 } : {}) };
      let line_items, amount;
      const priceId = stripePriceId(plan, 'once') || process.env.STRIPE_PRICE_ID;
      if (priceId) {
        const priceObj = await stripe.prices.retrieve(priceId);
        amount = priceObj.unit_amount;
        line_items = [{ price: priceId, quantity: 1 }];
      } else {
        amount = amountFor(plan, 'once');
        line_items = [{ quantity: 1, price_data: { currency: 'usd', unit_amount: amount, product_data: { name: `Brasero - ${PLANS[plan].name} formula` } } }];
      }
      if (brandCharged) {
        amount += MODULES.branding.unit;
        line_items.push({ quantity: 1, price_data: { currency: 'usd', unit_amount: MODULES.branding.unit, product_data: { name: 'Brasero - Social media branding' } } });
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: email || undefined,
        allow_promotion_codes: true,
        line_items,
        success_url: `${SITE}/onboarding.html?paid=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE}/checkout.html`,
        metadata: { plan, billing: 'once', mix: JSON.stringify(seedMix), name: name || '', email: email || '', handle: handle || '', instagram: instagram || '', niche: niche || '' },
      });
      try { await saveOrder({ stripe_session_id: session.id, status: 'pending', plan, billing: 'once', amount, name, email, instagram, handle }); }
      catch (e) { console.error('saveOrder failed', e); }
      return res.json({ url: session.url, label: PLANS[plan].name, amount });
    }

    // Tracker upsell: add one catalogue item (carousels / stories / branding) to an existing order.
    if (addon_ref && addon_item && ITEMS[addon_item]) {
      const it = ITEMS[addon_item];
      const ar = encodeURIComponent(addon_ref);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: email || undefined,
        allow_promotion_codes: true,          // show the "Add promotion code" field
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: it.amount, product_data: { name: `Brasero - ${it.name}` } } }],
        success_url: `${SITE}/app.html?order=${ar}`,
        cancel_url: `${SITE}/app.html?order=${ar}`,
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
          product_data: { name: `Brasero - ${PLANS[plan].name} pack` },
          ...(mode === 'subscription' ? { recurring: { interval: 'month' } } : {}),
        },
      }];
    }

    line_items = [...line_items, ...addonLineItems(addOns)];

    const ar = encodeURIComponent(addon_ref || '');
    const session = await stripe.checkout.sessions.create({
      mode,
      customer_email: email || undefined,
      allow_promotion_codes: true,          // show the "Add promotion code" field
      line_items,
      success_url: isAddon
        ? `${SITE}/app.html?order=${ar}`
        : `${SITE}/onboarding.html?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: isAddon
        ? `${SITE}/app.html?order=${ar}`
        : `${SITE}/checkout.html?plan=${plan}&billing=${billing}`,
      metadata: { plan, billing, name: name || '', email: email || '', handle: handle || '', instagram: instagram || '', niche: niche || '', addon_ref: addon_ref || '', addons: addOns.join(',') },
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
