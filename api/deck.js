import { findOrderByRefEmail, decksForOrder, getDeck, patchDeck, publicOrder, send } from './_lib.js';

// Customer-driven deck actions, authenticated by ref + email each call.
//   action = validate_script | validate_design | request_revision
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const { ref = '', email = '', deckId = '', action = '', script = '', note = '' } = req.body || {};
    if (!ref || !email || !deckId || !action) return res.status(400).json({ ok: false, error: 'missing' });

    const order = await findOrderByRefEmail(ref, email);
    if (!order) return res.status(404).json({ ok: false, error: 'not_found' });

    const deck = await getDeck(deckId);
    if (!deck || deck.order_id !== order.id) return res.status(403).json({ ok: false, error: 'forbidden' });

    const now = new Date().toISOString();
    let patch = null, notify = '';

    if (action === 'validate_script') {
      if (deck.status !== 'script_review') return res.status(409).json({ ok: false, error: 'wrong_state' });
      patch = { script: String(script || deck.script || ''), status: 'designing', script_validated_at: now };
      notify = `✅ Script approved — "${deck.title || 'deck'}" (#${order.ref || ''})`;
    } else if (action === 'validate_design') {
      if (deck.status !== 'design_review') return res.status(409).json({ ok: false, error: 'wrong_state' });
      patch = { status: 'done', design_validated_at: now };
      notify = `🎉 Design approved — "${deck.title || 'deck'}" (#${order.ref || ''})`;
    } else if (action === 'request_revision') {
      if (deck.status !== 'design_review') return res.status(409).json({ ok: false, error: 'wrong_state' });
      patch = { status: 'revision', revision_note: String(note || '').slice(0, 2000) };
      notify = `✏️ Retouch requested — "${deck.title || 'deck'}" (#${order.ref || ''})`;
    } else {
      return res.status(400).json({ ok: false, error: 'bad_action' });
    }

    await patchDeck(deckId, patch);

    // Notify the studio inbox (no-ops if MAIL_TO unset).
    try {
      await send(notify, `<h2>${notify}</h2>
        <p><b>Client:</b> ${order.name || '—'} · ${order.email}</p>
        <p><b>Order:</b> #${order.ref || ''} · ${order.plan || ''}</p>
        ${note ? `<p><b>Retouch note:</b><br>${String(note).replace(/</g, '&lt;')}</p>` : ''}`);
    } catch (e) { console.error('notify', e); }

    const decks = await decksForOrder(order.id);
    res.json({ ok: true, order: publicOrder(order, decks) });
  } catch (err) {
    console.error('deck', err);
    res.status(500).json({ ok: false });
  }
}
