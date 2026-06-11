import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveOrder, markPaid, saveOnboarding, sendTo, clientOrderEmail } from '../api/_lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_xxx');
const SITE_URL = (process.env.SITE_URL || 'http://localhost:8080').replace(/\/+$/, '');
const PORT = process.env.PORT || 4242;

/* ---- Plans (prices live ONLY on the server — never trust the client) ----
   Amounts in cents. Subscription = 10% off, rounded to whole dollars
   to match the frontend display. */
const PLANS = {
  starter: { name: 'Starter', amount: 12000 },
  flame:   { name: 'Flame',   amount: 24000 },
  burst:   { name: 'Burst',   amount: 29000 },
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
    markPaid(s.id, s.amount_total).catch(console.error);
    const to = s.customer_email || m.email;
    sendTo(to, 'Your Brasero order is confirmed 🎉', clientOrderEmail({
      name: m.name, planName: PLANS[m.plan]?.name || m.plan, billing: m.billing,
      amountCents: s.amount_total, handle: m.handle, ref: s.id.slice(-8).toUpperCase(),
    })).catch(console.error);
    send(`💸 New ${m.plan || ''} order — ${m.name || s.customer_email}`,
      `<h2>Payment received</h2>
       <p><b>Plan:</b> ${m.plan} (${m.billing === 'sub' ? 'subscription' : 'one-time'})</p>
       <p><b>Amount:</b> $${(s.amount_total / 100).toFixed(2)}</p>
       <p><b>Name:</b> ${m.name || '—'}</p>
       <p><b>Email:</b> ${s.customer_email || m.email || '—'}</p>
       <p><b>Instagram:</b> ${m.handle || ''} ${m.instagram ? `(${m.instagram})` : ''}</p>
       <p><b>Stripe session:</b> ${s.id}</p>`
    ).catch(console.error);
  }
  res.json({ received: true });
});

/* ===================== Normal middleware ===================== */
app.use(cors({ origin: process.env.SITE_URL ? process.env.SITE_URL : true }));
app.use(express.json({ limit: '2mb' })); // room for the small profile-photo data URL

app.get('/health', (_req, res) => res.json({ ok: true }));

/* Create a Stripe Checkout Session and return its URL */
app.post('/api/checkout-session', async (req, res) => {
  try {
    const { plan, billing, name, email, handle, instagram } = req.body || {};
    if (!PLANS[plan]) return res.status(400).json({ error: 'Unknown plan' });

    let mode, line_items, amount;
    if (process.env.STRIPE_PRICE_ID) {
      // Use an existing Stripe Price (e.g. your 1€ test product).
      const priceObj = await stripe.prices.retrieve(process.env.STRIPE_PRICE_ID);
      mode = priceObj.recurring ? 'subscription' : 'payment';
      amount = priceObj.unit_amount;
      line_items = [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }];
    } else {
      // Dynamic pricing from the server-side PLANS table (production).
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
      success_url: `${SITE_URL}/onboarding.html?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/checkout.html?plan=${plan}&billing=${billing}`,
      metadata: { plan, billing, name: name || '', email: email || '', handle: handle || '', instagram: instagram || '' },
    });
    try { await saveOrder({ stripe_session_id: session.id, status: 'pending', plan, billing, amount, name, email, instagram, handle }); }
    catch (e) { console.error('saveOrder failed', e); }
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
      .map(([k, v]) => `<tr><td style="padding:6px 12px;font-weight:700;vertical-align:top">${k}</td><td style="padding:6px 12px">${(v || '—').toString().replace(/</g, '&lt;')}</td></tr>`)
      .join('');
    await send(`📥 New onboarding — ${order.handle || order.email || 'client'}`,
      `<h2>New onboarding submitted</h2>
       <p><b>Client:</b> ${order.name || '—'} · ${order.email || '—'}</p>
       <p><b>Plan:</b> ${order.planName || order.plan || '—'} (${order.billing === 'sub' ? 'subscription' : 'one-time'})</p>
       <p><b>Instagram:</b> ${order.handle || ''} ${order.instagram ? `(${order.instagram})` : ''}</p>
       <table style="border-collapse:collapse;margin-top:12px">${rows}</table>`
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

/* Optional: serve the static site from this same server (single deploy) */
if (process.env.SERVE_STATIC === '1') {
  app.use(express.static(path.join(__dirname, '..')));
}

app.listen(PORT, () => console.log(`Brasero backend on http://localhost:${PORT}  (site: ${SITE_URL})`));
