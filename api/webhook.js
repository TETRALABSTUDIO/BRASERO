import { stripe, send, sendTo, markPaid, PLANS, clientOrderEmail } from './_lib.js';

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
    try { await markPaid(s.id, s.amount_total); } catch (e) { console.error(e); }
    // Confirmation email to the customer
    try {
      const to = s.customer_email || m.email;
      await sendTo(to, 'Your Brasero order is confirmed 🎉', clientOrderEmail({
        name: m.name, planName: PLANS[m.plan]?.name || m.plan, billing: m.billing,
        amountCents: s.amount_total, handle: m.handle, ref,
      }));
    } catch (e) { console.error('client email failed', e); }
    // Internal notification (only if MAIL_TO is set)
    try {
      await send(`💸 New ${m.plan || ''} order — ${m.name || s.customer_email}`,
        `<h2>Payment received</h2>
         <p><b>Plan:</b> ${m.plan} (${m.billing === 'sub' ? 'subscription' : 'one-time'})</p>
         <p><b>Amount:</b> $${(s.amount_total / 100).toFixed(2)}</p>
         <p><b>Name:</b> ${m.name || '—'}</p>
         <p><b>Email:</b> ${s.customer_email || m.email || '—'}</p>
         <p><b>Instagram:</b> ${m.handle || ''} ${m.instagram ? `(${m.instagram})` : ''}</p>
         <p><b>Stripe session:</b> ${s.id}</p>`);
    } catch (e) { console.error(e); }
  }
  res.json({ received: true });
}
