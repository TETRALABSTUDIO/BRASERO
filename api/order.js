import { findOrderByRefEmail, decksForOrder, publicOrder } from './_lib.js';

// POST { ref, email } → the customer's order + decks for the tracking page.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const { ref = '', email = '' } = req.body || {};
    if (!ref || !email) return res.status(400).json({ ok: false, error: 'missing' });
    const order = await findOrderByRefEmail(ref, email);
    if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
    const decks = await decksForOrder(order.id);
    res.json({ ok: true, order: publicOrder(order, decks) });
  } catch (err) {
    console.error('order', err);
    res.status(500).json({ ok: false });
  }
}
