import { verifyPaidSession } from './_lib.js';

// Verify a Stripe Checkout session is paid before unlocking the onboarding form.
// POST { sessionId } (or GET ?session_id=) → { ok, paid, order? }
export default async function handler(req, res) {
  const sessionId = (req.method === 'POST' ? (req.body || {}).sessionId : req.query.session_id) || '';
  try {
    const order = await verifyPaidSession(sessionId);
    if (!order) return res.status(200).json({ ok: true, paid: false });
    return res.status(200).json({ ok: true, paid: true, order });
  } catch (err) {
    console.error('session verify', err);
    return res.status(500).json({ ok: false });
  }
}
