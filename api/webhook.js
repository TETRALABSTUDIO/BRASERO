import { stripe, send, sendTo, markPaid, populateOrderElements, populateFromCart, cartLabel, PLANS, clientOrderEmail, addonClientEmail, addDecksToOrder, addItemsToOrder, siteUrl, clientMagicLink, upsertClient } from './_lib.js';

// Stripe needs the raw request body to verify the signature.
export const config = { api: { bodyParser: false } };

function buffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  let event;
  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const m = s.metadata || {};
    const ref = s.id.slice(-8).toUpperCase();

    // Add-on: extra items bought for an existing order, attach, don't create a new order.
    if (m.addon_ref) {
      try {
        const r = m.addon_item ? await addItemsToOrder(m.addon_ref, m.addon_item) : await addDecksToOrder(m.addon_ref, m.plan);
        const label = m.addon_item ? (r.name || m.addon_item) : `${PLANS[m.plan]?.name || m.plan} pack`;
        const to = s.customer_email || m.email;
        const trackUrl = to ? clientMagicLink(siteUrl(req), to, m.addon_ref) : '';
        await sendTo(to, 'Your new Brasero items are on the way 🔥', addonClientEmail({
          name: m.name, planName: label, count: r.created || 0, ref: m.addon_ref, trackUrl,
        }));
        await send(`➕ Add-on on #${m.addon_ref}: ${label} (+${r.created || 0})`,
          `<p><b>Order:</b> #${m.addon_ref}</p><p><b>Item:</b> ${label} · +${r.created || 0}</p><p><b>Amount:</b> $${(s.amount_total / 100).toFixed(2)}</p><p><b>Email:</b> ${s.customer_email || m.email || '-'}</p>`);
      } catch (e) { console.error('addon failed', e); }
      return res.json({ received: true });
    }

    // Modular orders carry a `cart` in metadata; legacy orders carry plan/addons.
    let cart = null;
    if (m.cart) { try { cart = JSON.parse(m.cart); } catch (e) { console.error('bad cart metadata', e); } }
    const offerLabel = cart ? cartLabel(cart) : (PLANS[m.plan]?.name || m.plan);

    let order = null, persistFailed = false;
    try { order = await markPaid(s.id, s.amount_total); } catch (e) { console.error(e); persistFailed = true; }
    // Create/link the client account (their space aggregates every order they place).
    try { await upsertClient({ email: s.customer_email || m.email, name: m.name }); } catch (e) { console.error('client upsert failed', e); }
    // Seed the full board so the talent opens a ready-to-fill order: every purchased module (or, for legacy orders, plan decks + upsells).
    try {
      if (order && cart) await populateFromCart(order.id, cart);
      else if (order) await populateOrderElements(order.id, { plan: m.plan, addons: (m.addons || '').split(',').map(a => a.trim()).filter(Boolean) });
    } catch (e) { console.error('populate elements failed', e); persistFailed = true; }
    // A paid order that didn't persist is a silent loss: 500 so Stripe retries.
    // markPaid + populateOrderElements are both idempotent, and emails are sent
    // only below (after this guard), so a retry never duplicates them.
    if (persistFailed) return res.status(500).json({ error: 'persist_failed' });
    // Confirmation email to the customer
    try {
      const to = s.customer_email || m.email;
      const trackUrl = to ? clientMagicLink(siteUrl(req), to, ref) : '';
      await sendTo(to, 'Your Brasero order is confirmed 🎉', clientOrderEmail({
        name: m.name, planName: offerLabel, billing: cart ? 'once' : m.billing,
        amountCents: s.amount_total, handle: m.handle, ref, trackUrl,
      }));
    } catch (e) { console.error('client email failed', e); }
    // Internal notification (only if MAIL_TO is set)
    try {
      await send(`💸 New order - ${m.name || s.customer_email}`,
        `<h2>Payment received</h2>
         <p><b>Order:</b> ${offerLabel || '-'} (${cart ? 'one-time' : (m.billing === 'sub' ? 'subscription' : 'one-time')})</p>
         <p><b>Amount:</b> $${(s.amount_total / 100).toFixed(2)}</p>
         <p><b>Name:</b> ${m.name || '-'}</p>
         <p><b>Email:</b> ${s.customer_email || m.email || '-'}</p>
         <p><b>Instagram:</b> ${m.handle || ''} ${m.instagram ? `(${m.instagram})` : ''}</p>
         <p><b>Stripe session:</b> ${s.id}</p>`);
    } catch (e) { console.error(e); }
  }
  res.json({ received: true });
}
