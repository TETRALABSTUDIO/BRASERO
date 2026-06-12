import { findOrderByRefEmail, decksForOrder, publicOrder, getDeck, listMessages, addMessage,
  getTalentByEmail, sendTo, send, messageNotifyEmail, siteUrl } from './_lib.js';

// POST { ref, email, action? } → the customer's order + decks + message thread.
//   action = (none) load · send_message { body, deckId? }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const { ref = '', email = '', action = '', body = '', deckId = '' } = req.body || {};
    if (!ref || !email) return res.status(400).json({ ok: false, error: 'missing' });
    const order = await findOrderByRefEmail(ref, email);
    if (!order) return res.status(404).json({ ok: false, error: 'not_found' });

    if (action === 'send_message') {
      const text = String(body || '').trim();
      if (!text) return res.status(400).json({ ok: false, error: 'empty' });
      let dk = null;
      if (deckId) { const d = await getDeck(deckId); if (d && d.order_id === order.id) dk = d; }   // ignore foreign ids
      await addMessage(order.id, { deck_id: dk ? dk.id : null, sender: 'client', sender_name: order.name || 'Client', body: text });
      // Notify the studio + the assigned talent.
      try {
        const about = dk ? dk.title : '';
        await send(`💬 New message · #${order.ref || ''}`,
          `<p><b>From:</b> ${order.name || 'Client'} · ${order.email}</p>${about ? `<p><b>About:</b> ${about}</p>` : ''}<p>${text.replace(/</g, '&lt;')}</p>`);
        if (order.talent_email) {
          const talent = await getTalentByEmail(order.talent_email);
          await sendTo(order.talent_email, `💬 New message from ${order.name || 'your client'}`, messageNotifyEmail({
            name: talent?.name, ref: order.ref, fromName: order.name || 'Client', body: text, about,
            ctaUrl: `${siteUrl(req)}/panel.html`, ctaLabel: 'Open the panel →',
          }));
        }
      } catch (e) { console.error('msg notify', e); }
      return res.json({ ok: true, messages: await listMessages(order.id) });
    }

    const decks = await decksForOrder(order.id);
    const messages = await listMessages(order.id);
    res.json({ ok: true, order: publicOrder(order, decks), messages });
  } catch (err) {
    console.error('order', err);
    res.status(500).json({ ok: false });
  }
}
