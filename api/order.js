import { findOrderByRef, ordersForClient, decksForOrder, orderProgress, orderRef,
  publicOrder, getDeck, deckImages, listMessages, addMessage, getTalentByEmail, sendTo, send,
  messageNotifyEmail, siteUrl, clientFromAuth, ownsOrder } from './_lib.js';

// POST { action, ... } authenticated by a client session (Bearer token). The
// magic-link session aggregates every order the client owns.
//   my_orders                          → the signed-in client's orders (list)
//   (none) | messages | send_message   → one order's board + thread
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const { ref = '', action = '', body = '', deckId = '', images = [] } = req.body || {};
    const client = clientFromAuth(req);
    if (!client) return res.status(401).json({ ok: false, error: 'unauthorized' });

    // Client space: every paid order the signed-in client owns, with a progress summary.
    if (action === 'my_orders') {
      const orders = await ordersForClient(client);
      const list = await Promise.all(orders.map(async (o) => {
        const decks = await decksForOrder(o.id);
        const prog = orderProgress(decks);
        return {
          ref: o.ref || orderRef(o.stripe_session_id),
          name: o.name || '', plan: o.plan || '', billing: o.billing || '',
          status: o.status, created_at: o.created_at,
          percent: prog.percent, phase: prog.steps[prog.active] || '',
          total: decks.length, done: decks.filter((d) => d.status === 'done').length,
        };
      }));
      return res.json({ ok: true, orders: list });
    }

    // Resolve the single order being viewed/acted on (client can only reach their own).
    let order = null;
    if (ref) {
      const o = await findOrderByRef(ref);
      if (ownsOrder(o, client)) order = o;
    }
    if (!order) return res.status(403).json({ ok: false, error: 'not_found' });

    if (action === 'messages') {
      return res.json({ ok: true, messages: await listMessages(order.id) });
    }

    // On-demand image bytes for one deck (the board ships only image_count).
    if (action === 'deck_images') {
      const d = deckId ? await getDeck(deckId) : null;
      if (!d || d.order_id !== order.id) return res.status(404).json({ ok: false, error: 'not_found' });
      return res.json({ ok: true, images: deckImages(d) });
    }

    if (action === 'send_message') {
      const text = String(body || '').trim();
      const imgs = Array.isArray(images) ? images : [];
      if (!text && !imgs.length) return res.status(400).json({ ok: false, error: 'empty' });
      let dk = null;
      if (deckId) { const d = await getDeck(deckId); if (d && d.order_id === order.id) dk = d; }   // ignore foreign ids
      await addMessage(order.id, { deck_id: dk ? dk.id : null, sender: 'client', sender_name: order.name || 'Client', body: text, images: imgs });
      const notifyBody = text || `📎 ${imgs.length} image${imgs.length > 1 ? 's' : ''} attached`;
      // Notify the studio + the assigned talent.
      try {
        const about = dk ? dk.title : '';
        await send(`💬 New message · #${order.ref || ''}`,
          `<p><b>From:</b> ${order.name || 'Client'} · ${order.email}</p>${about ? `<p><b>About:</b> ${about}</p>` : ''}<p>${notifyBody.replace(/</g, '&lt;')}</p>`);
        if (order.talent_email) {
          const talent = await getTalentByEmail(order.talent_email);
          await sendTo(order.talent_email, `💬 New message from ${order.name || 'your client'}`, messageNotifyEmail({
            name: talent?.name, ref: order.ref, fromName: order.name || 'Client', body: notifyBody, about,
            ctaUrl: `${siteUrl(req)}/app.html`, ctaLabel: 'Open the panel →',
          }));
        }
      } catch (e) { console.error('msg notify', e); }
      return res.json({ ok: true, messages: await listMessages(order.id) });
    }

    const decks = await decksForOrder(order.id);
    const messages = await listMessages(order.id);
    let talent = null;
    if (order.talent_email) {
      const t = await getTalentByEmail(order.talent_email);
      if (t) talent = { name: t.name || '', photo: t.photo || '' };   // name + photo only, no contact details
    }
    res.json({ ok: true, order: publicOrder(order, decks), talent, messages });
  } catch (err) {
    console.error('order', err);
    res.status(500).json({ ok: false });
  }
}
