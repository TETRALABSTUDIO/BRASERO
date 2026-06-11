import { verifyToken, getTalentByEmail, findOrderByRef, getOrderById, decksForOrder, getDeck, patchDeck,
  adminListOrders, ordersForTalent, createDeck, deleteDeck, listTalents, createTalent, updateTalent, deleteTalent,
  assignOrder, orderState, orderRef, sendTo, reviewEmail, siteUrl } from './_lib.js';

const pub = o => ({ ref: o.ref || orderRef(o.stripe_session_id), name: o.name, email: o.email, plan: o.plan, talent_email: o.talent_email || '', created_at: o.created_at });

// Talent panel API. Authenticated by the Talent session token (Authorization: Bearer …).
// Talents see only orders assigned to them; owners see all + manage the team.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.headers['x-talent-token'];
  const session = verifyToken(tok);
  if (!session) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const me = await getTalentByEmail(session.email);
  if (!me) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const isOwner = !!me.is_owner;
  const owns = order => isOwner || (order.talent_email || '').toLowerCase() === me.email.toLowerCase();

  try {
    const b = req.body || {};
    const action = b.action;

    /* ----- order list (scoped) + per-project state ----- */
    if (action === 'list') {
      const rows = isOwner ? await adminListOrders() : await ordersForTalent(me.email);
      const orders = await Promise.all(rows.map(async o => { const dk = await decksForOrder(o.id); return { ...pub(o), state: orderState(dk), items: dk.length }; }));
      return res.json({ ok: true, me: { email: me.email, name: me.name || '', is_owner: isOwner, photo: me.photo || '' }, orders });
    }

    /* ----- self profile (any talent) ----- */
    if (action === 'update_me') {
      const r = await updateTalent({ email: me.email, name: b.name, photo: b.photo, password: b.password });
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      return res.json({ ok: true, me: { ...r.talent, is_owner: isOwner } });
    }

    /* ----- owner: team management ----- */
    if (action === 'list_talents') {
      if (!isOwner) return res.status(403).json({ ok: false, error: 'forbidden' });
      return res.json({ ok: true, talents: await listTalents() });
    }
    if (action === 'create_talent') {
      if (!isOwner) return res.status(403).json({ ok: false, error: 'forbidden' });
      const r = await createTalent({ email: b.email, password: b.password, name: b.name, is_owner: !!b.is_owner });
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      return res.json({ ok: true, talent: r.talent, talents: await listTalents() });
    }
    if (action === 'update_talent') {
      if (!isOwner) return res.status(403).json({ ok: false, error: 'forbidden' });
      const r = await updateTalent({ email: b.email, name: b.name, password: b.password, is_owner: b.is_owner, photo: b.photo });
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      return res.json({ ok: true, talents: await listTalents() });
    }
    if (action === 'delete_talent') {
      if (!isOwner) return res.status(403).json({ ok: false, error: 'forbidden' });
      if (String(b.email || '').toLowerCase() === me.email.toLowerCase()) return res.status(400).json({ ok: false, error: 'self' });
      const r = await deleteTalent(b.email);
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      return res.json({ ok: true, talents: await listTalents(), orders: (await adminListOrders()).map(pub) });
    }
    if (action === 'assign_order') {
      if (!isOwner) return res.status(403).json({ ok: false, error: 'forbidden' });
      const r = await assignOrder(b.ref, b.talentEmail || null);
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      return res.json({ ok: true, orders: (await adminListOrders()).map(pub) });
    }

    /* ----- order-scoped ----- */
    const order = await findOrderByRef(b.ref);
    if (action === 'get') {
      if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
      if (!owns(order)) return res.status(403).json({ ok: false, error: 'forbidden' });
      return res.json({ ok: true, order: pub(order), decks: await decksForOrder(order.id) });
    }

    if (action === 'add_deck') {
      if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
      if (!owns(order)) return res.status(403).json({ ok: false, error: 'forbidden' });
      const existing = await decksForOrder(order.id);
      await createDeck(order.id, { position: existing.length, title: b.title || `Deck ${existing.length + 1}` });
      return res.json({ ok: true, decks: await decksForOrder(order.id) });
    }

    /* ----- deck-scoped (ownership checked via the deck's order) ----- */
    const deck = b.deckId ? await getDeck(b.deckId) : null;
    if (!deck) return res.status(404).json({ ok: false, error: 'deck_not_found' });
    const deckOrder = await getOrderById(deck.order_id);
    if (!deckOrder || !owns(deckOrder)) return res.status(403).json({ ok: false, error: 'forbidden' });

    if (action === 'save_deck') {
      const patch = {};
      if (b.title != null) patch.title = b.title;
      if (b.script != null) patch.script = b.script;
      if (Array.isArray(b.images)) patch.design_urls = b.images.filter(Boolean).slice(0, 10);
      await patchDeck(deck.id, patch);
      return res.json({ ok: true, decks: await decksForOrder(deck.order_id) });
    }

    if (action === 'delete_deck') {
      await deleteDeck(deck.id);
      return res.json({ ok: true, decks: await decksForOrder(deck.order_id) });
    }

    if (action === 'send_script' || action === 'send_design') {
      const isScript = action === 'send_script';
      // The design can only be sent once the client has approved the script.
      if (!isScript && !['designing', 'design_review', 'revision', 'done'].includes(deck.status)) {
        return res.status(409).json({ ok: false, error: 'script_not_validated' });
      }
      const patch = isScript
        ? { status: 'script_review', ...(b.script != null ? { script: b.script } : {}) }
        : { status: 'design_review', ...(Array.isArray(b.images) ? { design_urls: b.images.filter(Boolean).slice(0, 10) } : {}) };
      await patchDeck(deck.id, patch);

      // Email the customer that they have something to validate.
      if (deckOrder.email) {
        const ref = deckOrder.ref || orderRef(deckOrder.stripe_session_id);
        const url = `${siteUrl(req)}/track.html?ref=${encodeURIComponent(ref)}&email=${encodeURIComponent(deckOrder.email)}`;
        try {
          await sendTo(deckOrder.email,
            isScript ? 'Your Brasero script is ready to review 👀' : 'Your Brasero design is ready to review 👀',
            reviewEmail({ name: deckOrder.name, kind: isScript ? 'script' : 'design', deckTitle: deck.title, ref, url }));
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
