import { findOrderByRef, decksForOrder, getDeck, patchDeck, adminListOrders, createDeck, deleteDeck, orderRef, sendTo, reviewEmail, siteUrl } from './_lib.js';

// Studio-only panel API. Guarded by the ADMIN_TOKEN env (sent as x-admin-token).
// Actions: list | get | add_deck | save_deck | send_script | send_design | delete_deck
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  if (!process.env.ADMIN_TOKEN || req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    const b = req.body || {};
    const action = b.action;

    if (action === 'list') {
      const orders = (await adminListOrders()).map(o => ({
        ref: o.ref || orderRef(o.stripe_session_id), name: o.name, email: o.email, plan: o.plan, created_at: o.created_at,
      }));
      return res.json({ ok: true, orders });
    }

    // Everything below needs an order resolved by ref.
    const order = await findOrderByRef(b.ref);
    if (action === 'get') {
      if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
      return res.json({ ok: true, order: { ref: order.ref || orderRef(order.stripe_session_id), name: order.name, email: order.email, plan: order.plan }, decks: await decksForOrder(order.id) });
    }

    if (action === 'add_deck') {
      if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
      const existing = await decksForOrder(order.id);
      await createDeck(order.id, { position: existing.length, title: b.title || `Deck ${existing.length + 1}` });
      return res.json({ ok: true, decks: await decksForOrder(order.id) });
    }

    // Deck-scoped actions.
    const deck = b.deckId ? await getDeck(b.deckId) : null;
    if (!deck) return res.status(404).json({ ok: false, error: 'deck_not_found' });

    if (action === 'save_deck') {
      const patch = {};
      if (b.title != null) patch.title = b.title;
      if (b.script != null) patch.script = b.script;
      if (b.design_url != null) patch.design_url = b.design_url;
      await patchDeck(deck.id, patch);
      return res.json({ ok: true, decks: await decksForOrder(deck.order_id) });
    }

    if (action === 'delete_deck') {
      await deleteDeck(deck.id);
      return res.json({ ok: true, decks: await decksForOrder(deck.order_id) });
    }

    if (action === 'send_script' || action === 'send_design') {
      const isScript = action === 'send_script';
      const patch = isScript
        ? { status: 'script_review', ...(b.script != null ? { script: b.script } : {}) }
        : { status: 'design_review', ...(b.design_url != null ? { design_url: b.design_url } : {}) };
      await patchDeck(deck.id, patch);

      // Email the customer that they have something to validate.
      if (order && order.email) {
        const ref = order.ref || orderRef(order.stripe_session_id);
        const url = `${siteUrl(req)}/track.html?ref=${encodeURIComponent(ref)}&email=${encodeURIComponent(order.email)}`;
        try {
          await sendTo(order.email,
            isScript ? 'Your Brasero script is ready to review 👀' : 'Your Brasero design is ready to review 👀',
            reviewEmail({ name: order.name, kind: isScript ? 'script' : 'design', deckTitle: deck.title, ref, url }));
        } catch (e) { console.error('review email', e); }
      }
      return res.json({ ok: true, decks: await decksForOrder(deck.order_id) });
    }

    return res.status(400).json({ ok: false, error: 'bad_action' });
  } catch (err) {
    console.error('admin', err);
    res.status(500).json({ ok: false });
  }
}
