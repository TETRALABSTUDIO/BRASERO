import { verifyToken, getTalentByEmail, findOrderByRef, getOrderById, decksForOrder, getDeck, patchDeck,
  adminListOrders, ordersForTalent, createDeck, deleteDeck, listTalents, createTalent, updateTalent, deleteTalent,
  assignOrder, createManualOrder, populateOrderElements, orderState, orderRef, sendTo, reviewEmail, siteUrl,
  signToken, randomPassword, PLANS, talentInviteEmail, talentAssignedEmail } from './_lib.js';

const pub = o => ({ ref: o.ref || orderRef(o.stripe_session_id), name: o.name, email: o.email, plan: o.plan, billing: o.billing || '', amount: o.amount || 0, instagram: o.instagram || '', phone: o.phone || '', addons: Array.isArray(o.addons) ? o.addons : [], talent_email: o.talent_email || '', created_at: o.created_at });

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
      // Invite flow: the talent sets their own password/name/photo via the setup link.
      const r = await createTalent({ email: b.email, password: b.password || randomPassword(), name: b.name, is_owner: !!b.is_owner });
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      try {
        const token = signToken({ email: String(b.email).trim().toLowerCase(), setup: true }, 7);
        const setupUrl = `${siteUrl(req)}/panel.html?setup=${encodeURIComponent(token)}`;
        await sendTo(b.email, "You're invited to Brasero Studio 🎨", talentInviteEmail({ name: b.name, setupUrl }));
      } catch (e) { console.error('invite email', e); }
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
      if (b.talentEmail) {   // notify the talent (not on unassign)
        try {
          const [order, talent] = await Promise.all([findOrderByRef(b.ref), getTalentByEmail(b.talentEmail)]);
          await sendTo(b.talentEmail, '🚀 New project assigned to you', talentAssignedEmail({
            name: talent?.name,
            ref: order ? (order.ref || orderRef(order.stripe_session_id)) : b.ref,
            clientName: order?.name,
            planName: order?.plan ? (PLANS[order.plan]?.name || order.plan) : '',
            panelUrl: `${siteUrl(req)}/panel.html`,
          }));
        } catch (e) { console.error('assign email', e); }
      }
      return res.json({ ok: true, orders: (await adminListOrders()).map(pub) });
    }
    if (action === 'create_order') {
      if (!isOwner) return res.status(403).json({ ok: false, error: 'forbidden' });
      if (!b.email && !b.name) return res.status(400).json({ ok: false, error: 'missing' });
      const r = await createManualOrder({ name: b.name, email: b.email, instagram: b.instagram, handle: b.handle, plan: b.plan, billing: b.billing, talent_email: b.talentEmail, decks: b.decks, phone: b.phone, addons: b.addons, answers: b.answers });
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      if (b.talentEmail) {   // notify the assigned talent
        try {
          const talent = await getTalentByEmail(b.talentEmail);
          await sendTo(b.talentEmail, '🚀 New project assigned to you', talentAssignedEmail({
            name: talent?.name, ref: r.ref, clientName: b.name,
            planName: b.plan ? (PLANS[b.plan]?.name || b.plan) : '', panelUrl: `${siteUrl(req)}/panel.html`,
          }));
        } catch (e) { console.error('assign email', e); }
      }
      const rows = await adminListOrders();
      const orders = await Promise.all(rows.map(async o => { const dk = await decksForOrder(o.id); return { ...pub(o), state: orderState(dk), items: dk.length }; }));
      return res.json({ ok: true, ref: r.ref, orders });
    }

    /* ----- order-scoped ----- */
    const order = await findOrderByRef(b.ref);
    if (action === 'get') {
      if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
      if (!owns(order)) return res.status(403).json({ ok: false, error: 'forbidden' });
      let decks = await decksForOrder(order.id);
      // Top up the board to the full offer (plan decks + upsells) as long as no work
      // has started — so old/partial orders show every element ready to fill, while
      // any order already in progress is left untouched.
      const started = decks.some(d => d.script || d.design_url || (Array.isArray(d.design_urls) && d.design_urls.length) || (d.status && d.status !== 'writing'));
      if (!started) {
        const r = await populateOrderElements(order.id, { plan: order.plan, addons: order.addons });
        if (r.created) decks = await decksForOrder(order.id);
      }
      return res.json({ ok: true, order: pub(order), decks });
    }

    if (action === 'add_deck') {
      if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
      if (!owns(order)) return res.status(403).json({ ok: false, error: 'forbidden' });
      if (!isOwner) return res.status(403).json({ ok: false, error: 'owner_only' });
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
      if (!isOwner) return res.status(403).json({ ok: false, error: 'owner_only' });
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
