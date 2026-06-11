import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveOrder, markPaid, saveOnboarding, sendTo, clientOrderEmail, addonClientEmail, addDecksToOrder, addItemsToOrder, stripePriceId, addonLineItems, addonKeys, ITEMS } from '../api/_lib.js';
import orderHandler from '../api/order.js';
import deckHandler from '../api/deck.js';
import adminHandler from '../api/admin.js';
import authHandler from '../api/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_xxx');
const SITE_URL = (process.env.SITE_URL || 'http://localhost:8080').replace(/\/+$/, '');
const PORT = process.env.PORT || 4242;

/* ---- Plans (prices live ONLY on the server - never trust the client) ----
   Amounts in cents. Subscription = 10% off, rounded to whole dollars
   to match the frontend display. */
const PLANS = {
  starter: { name: 'Ember',  amount: 12000 },
  flame:   { name: 'Flame',  amount: 24000 },
  burst:   { name: 'Meteor', amount: 35000 },
};
function amountFor(plan, billing) {
  const baseDollars = PLANS[plan].amount / 100;
  const dollars = billing === 'sub' ? Math.round(baseDollars * 0.9) : baseDollars;
  return dollars * 100;
}

/* ---- Email (optional: logs to console if SMTP not configured) ---- */
const mailer = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
}) : null;

async function send(subject, html) {
  if (!mailer) { console.log('\n[email:dev] ' + subject + '\n' + html.replace(/<[^>]+>/g, '').trim() + '\n'); return; }
  await mailer.sendMail({ from: process.env.MAIL_FROM, to: process.env.MAIL_TO, subject, html });
}

/* ===================== Stripe webhook (RAW body, must come first) ===================== */
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const m = s.metadata || {};

    // Add-on: extra decks for an existing order - attach instead of creating a new order.
    if (m.addon_ref) {
      (async () => {
        try {
          const r = m.addon_item ? await addItemsToOrder(m.addon_ref, m.addon_item) : await addDecksToOrder(m.addon_ref, m.plan);
          const label = m.addon_item ? (r.name || m.addon_item) : `${PLANS[m.plan]?.name || m.plan} pack`;
          const to = s.customer_email || m.email;
          const trackUrl = to ? `${SITE_URL}/track.html?ref=${encodeURIComponent(m.addon_ref)}&email=${encodeURIComponent(to)}` : '';
          await sendTo(to, 'Your new Brasero items are on the way 🔥', addonClientEmail({
            name: m.name, planName: label, count: r.created || 0, ref: m.addon_ref, trackUrl,
          }));
          await send(`➕ Add-on on #${m.addon_ref}: ${label} (+${r.created || 0})`,
            `<p>Order #${m.addon_ref} · ${label} · +${r.created || 0} · $${(s.amount_total / 100).toFixed(2)}</p>`);
        } catch (e) { console.error('addon failed', e); }
      })();
      return res.json({ received: true });
    }

    markPaid(s.id, s.amount_total).catch(console.error);
    const to = s.customer_email || m.email;
    const ref = s.id.slice(-8).toUpperCase();
    const trackUrl = to ? `${SITE_URL}/track.html?ref=${encodeURIComponent(ref)}&email=${encodeURIComponent(to)}` : '';
    sendTo(to, 'Your Brasero order is confirmed 🎉', clientOrderEmail({
      name: m.name, planName: PLANS[m.plan]?.name || m.plan, billing: m.billing,
      amountCents: s.amount_total, handle: m.handle, ref, trackUrl,
    })).catch(console.error);
    send(`💸 New ${m.plan || ''} order - ${m.name || s.customer_email}`,
      `<h2>Payment received</h2>
       <p><b>Plan:</b> ${m.plan} (${m.billing === 'sub' ? 'subscription' : 'one-time'})</p>
       <p><b>Amount:</b> $${(s.amount_total / 100).toFixed(2)}</p>
       <p><b>Name:</b> ${m.name || '-'}</p>
       <p><b>Email:</b> ${s.customer_email || m.email || '-'}</p>
       <p><b>Instagram:</b> ${m.handle || ''} ${m.instagram ? `(${m.instagram})` : ''}</p>
       <p><b>Add-ons:</b> ${m.addons || '-'}</p>
       <p><b>Stripe session:</b> ${s.id}</p>`
    ).catch(console.error);
  }
  res.json({ received: true });
});

/* ===================== Normal middleware ===================== */
app.use(cors({ origin: process.env.SITE_URL ? process.env.SITE_URL : true }));
app.use(express.json({ limit: '14mb' })); // room for profile photo + compressed deck images

app.get('/health', (_req, res) => res.json({ ok: true }));

/* Create a Stripe Checkout Session and return its URL */
app.post('/api/checkout-session', async (req, res) => {
  try {
    const { plan, billing, name, email, handle, instagram, addon_ref, addons, addon_item } = req.body || {};

    // Tracker upsell: add one catalogue item (carousels / stories / branding) to an existing order.
    if (addon_ref && addon_item && ITEMS[addon_item]) {
      const it = ITEMS[addon_item];
      const ar = encodeURIComponent(addon_ref), em = encodeURIComponent(email || '');
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: email || undefined,
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: it.amount, product_data: { name: `Brasero - ${it.name}` } } }],
        success_url: `${SITE_URL}/track.html?ref=${ar}&email=${em}&addon=1`,
        cancel_url: `${SITE_URL}/track.html?ref=${ar}&email=${em}`,
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
      // Real Stripe Price for this plan + billing (or legacy test price).
      const priceObj = await stripe.prices.retrieve(priceId);
      mode = priceObj.recurring ? 'subscription' : 'payment';
      amount = priceObj.unit_amount;
      line_items = [{ price: priceId, quantity: 1 }];
    } else {
      // Dynamic pricing from the server-side PLANS table (production).
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

    const ar = encodeURIComponent(addon_ref || ''), em = encodeURIComponent(email || '');
    const session = await stripe.checkout.sessions.create({
      mode,
      customer_email: email || undefined,
      line_items,
      success_url: isAddon
        ? `${SITE_URL}/track.html?ref=${ar}&email=${em}&addon=1`
        : `${SITE_URL}/onboarding.html?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: isAddon
        ? `${SITE_URL}/track.html?ref=${ar}&email=${em}`
        : `${SITE_URL}/checkout.html?plan=${plan}&billing=${billing}`,
      metadata: { plan, billing, name: name || '', email: email || '', handle: handle || '', instagram: instagram || '', addon_ref: addon_ref || '', addons: addOns.join(',') },
    });
    if (!isAddon) {
      try { await saveOrder({ stripe_session_id: session.id, status: 'pending', plan, billing, amount, name, email, instagram, handle }); }
      catch (e) { console.error('saveOrder failed', e); }
    }
    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create checkout session' });
  }
});

/* Receive the onboarding answers and email them to the studio */
app.post('/api/onboarding', async (req, res) => {
  try {
    const { order = {}, answers = {}, sessionId = '' } = req.body || {};
    try { await saveOnboarding({ sessionId, email: order.email, handle: order.handle, answers }); }
    catch (e) { console.error('saveOnboarding failed', e); }
    const rows = Object.entries(answers)
      .map(([k, v]) => `<tr><td style="padding:6px 12px;font-weight:700;vertical-align:top">${k}</td><td style="padding:6px 12px">${(v || '-').toString().replace(/</g, '&lt;')}</td></tr>`)
      .join('');
    await send(`📥 New onboarding - ${order.handle || order.email || 'client'}`,
      `<h2>New onboarding submitted</h2>
       <p><b>Client:</b> ${order.name || '-'} · ${order.email || '-'}</p>
       <p><b>Plan:</b> ${order.planName || order.plan || '-'} (${order.billing === 'sub' ? 'subscription' : 'one-time'})</p>
       <p><b>Instagram:</b> ${order.handle || ''} ${order.instagram ? `(${order.instagram})` : ''}</p>
       <table style="border-collapse:collapse;margin-top:12px">${rows}</table>`
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

/* Order tracking (customer) + Talent panel + auth */
app.post('/api/order', orderHandler);
app.post('/api/deck', deckHandler);
app.post('/api/auth', authHandler);
app.post('/api/admin', adminHandler);

/* Optional: serve the static site from this same server (single deploy) */
if (process.env.SERVE_STATIC === '1') {
  app.use(express.static(path.join(__dirname, '..')));
}

app.listen(PORT, () => console.log(`Brasero backend on http://localhost:${PORT}  (site: ${SITE_URL})`));
