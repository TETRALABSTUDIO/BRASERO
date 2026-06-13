import { verifyToken, getTalentByEmail, findOrderByRef, getOrderById, decksForOrder, getDeck, patchDeck, deckImages, publicDeckLite,
  decksMetaForOrder, adminListOrders, listAllOrders, ordersForTalent, createDeck, deleteDeck, listTalents, createTalent, updateTalent, deleteTalent,
  assignOrder, updateOrder, deleteOrder, syncOrderElements, createManualOrder, populateOrderElements, addItemsToOrder, orderState, orderRef, sendTo, reviewEmail, siteUrl, clientMagicLink,
  signToken, randomPassword, tempPassword, PLANS, ADDONS, amountFor, addonKeys, talentInviteEmail, talentAssignedEmail,
  listMessages, addMessage, deleteMessage, messageNotifyEmail,
  CAMPAIGN_STEPS, sendCampaignStep, setOrderCampaign } from './_lib.js';

// Talents never receive the client's price or contact details (email/phone/amount/billing).
const pub = (o, isOwner) => ({
  ref: o.ref || orderRef(o.stripe_session_id), name: o.name, plan: o.plan,
  instagram: o.instagram || '', addons: Array.isArray(o.addons) ? o.addons : [],
  talent_email: o.talent_email || '', created_at: o.created_at,
  ...(isOwner ? { email: o.email, phone: o.phone || '', amount: o.amount || 0, billing: o.billing || '', answers: o.answers || null } : {}),
});
// Count the board's elements per type, so the panel can compute deadlines + prefill the editor.
const kindsOf = dk => { const k = { carousel: 0, story: 0, branding: 0 }; for (const d of dk) { const t = d.type || 'carousel'; k[t] = (k[t] || 0) + 1; } return k; };
// done = approved, todo = not started (writing), active = anything in between (review/designing/revision).
const countsOf = dk => { const c = { done: 0, active: 0, todo: 0 }; for (const d of dk) { const s = d.status || 'writing'; if (s === 'done') c.done++; else if (s === 'writing') c.todo++; else c.active++; } return c; };

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
  // Enrich a list of order rows with per-project state + element count (used by the panel board/list).
  const enrich = async rows => Promise.all(rows.map(async o => { const dk = await decksMetaForOrder(o.id); return { ...pub(o, isOwner), state: orderState(dk), items: dk.length, kinds: kindsOf(dk), counts: countsOf(dk) }; }));

  try {
    const b = req.body || {};
    const action = b.action;

    /* ----- order list (scoped) + per-project state ----- */
    if (action === 'list') {
      const rows = isOwner ? await adminListOrders() : await ordersForTalent(me.email);
      const orders = await enrich(rows);
      return res.json({ ok: true, me: { email: me.email, name: me.name || '', is_owner: isOwner, photo: me.photo || '', must_reset: !!me.must_reset }, orders });
    }

    /* ----- owner dashboard: all projects + leads + talents ----- */
    if (action === 'dashboard') {
      if (!isOwner) return res.status(403).json({ ok: false, error: 'forbidden' });
      const all = await listAllOrders();
      const paid = all.filter(o => o.status === 'paid');
      const orders = await Promise.all(paid.map(async o => {
        const dk = await decksMetaForOrder(o.id);
        return { ...pub(o, true), status: o.status, onboarding_at: o.onboarding_at || null, state: orderState(dk), items: dk.length, kinds: kindsOf(dk), counts: countsOf(dk) };
      }));
      const leads = all.filter(o => o.status !== 'paid').map(o => ({
        ref: o.ref || '', name: o.name || '', email: o.email || '', plan: o.plan || '', billing: o.billing || '',
        amount: o.amount || 0, status: o.status || 'pending', handle: o.instagram || o.handle || '',
        created_at: o.created_at, onboarded: !!o.onboarding_at,
        campaign: (o.campaign && typeof o.campaign === 'object') ? o.campaign : null,
      }));
      return res.json({ ok: true, orders, leads, talents: await listTalents() });
    }

    // Password policy for user-chosen passwords: 8+ chars and at least one uppercase.
    const weakPw = p => p && (p.length < 8 || !/[A-Z]/.test(p));

    /* ----- self profile (any talent) ----- */
    if (action === 'update_me') {
      if (weakPw(b.password)) return res.status(400).json({ ok: false, error: 'weak_password' });
      const r = await updateTalent({ email: me.email, name: b.name, photo: b.photo, password: b.password, availability: b.availability, timezone: b.timezone });
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      return res.json({ ok: true, me: { ...r.talent, is_owner: isOwner } });
    }

    /* ----- owner: team management ----- */
    if (action === 'list_talents') {
      if (!isOwner) return res.status(403).json({ ok: false, error: 'forbidden' });
      return res.json({ ok: true, talents: await listTalents() });
    }
    // Owner one-click account switch: mint a session token for a talent account.
    if (action === 'login_as') {
      if (!isOwner) return res.status(403).json({ ok: false, error: 'forbidden' });
      const t = await getTalentByEmail(b.email);
      if (!t) return res.status(404).json({ ok: false, error: 'not_found' });
      return res.json({ ok: true, token: signToken({ email: t.email }) });
    }
    if (action === 'create_talent') {
      if (!isOwner) return res.status(403).json({ ok: false, error: 'forbidden' });
      // Quick create: generate a temporary password, the talent changes it on first login.
      const pw = tempPassword();
      const r = await createTalent({ email: b.email, password: pw, name: b.name, is_owner: !!b.is_owner, must_reset: true });
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      return res.json({ ok: true, talent: r.talent, password: pw, talents: await listTalents() });
    }
    if (action === 'update_talent') {
      if (!isOwner) return res.status(403).json({ ok: false, error: 'forbidden' });
      if (weakPw(b.password)) return res.status(400).json({ ok: false, error: 'weak_password' });
      const r = await updateTalent({ email: b.email, name: b.name, password: b.password, is_owner: b.is_owner, photo: b.photo, availability: b.availability, timezone: b.timezone, rates: b.rates });
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      return res.json({ ok: true, talents: await listTalents() });
    }
    if (action === 'delete_talent') {
      if (!isOwner) return res.status(403).json({ ok: false, error: 'forbidden' });
      if (String(b.email || '').toLowerCase() === me.email.toLowerCase()) return res.status(400).json({ ok: false, error: 'self' });
      const r = await deleteTalent(b.email);
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      return res.json({ ok: true, talents: await listTalents(), orders: await enrich(await adminListOrders()) });
    }
    // Lead-recovery campaign: send the next nudge, or toggle auto-send.
    if (action === 'campaign') {
      if (!isOwner) return res.status(403).json({ ok: false, error: 'forbidden' });
      const order = await findOrderByRef(b.ref);
      if (!order || order.status === 'paid') return res.status(404).json({ ok: false, error: 'not_found' });
      const c = (order.campaign && typeof order.campaign === 'object') ? order.campaign : { step: 0, auto: false, history: [] };
      if (b.op === 'set_auto') {
        const campaign = { ...c, step: c.step || 0, history: c.history || [], auto: !c.auto, updatedAt: new Date().toISOString() };
        const r = await setOrderCampaign(b.ref, campaign);
        if (r.error) return res.status(400).json({ ok: false, error: r.error });
        return res.json({ ok: true, ref: order.ref, campaign });
      }
      // send_next (default): send the next step in the sequence
      const step = c.step || 0;
      if (step >= CAMPAIGN_STEPS.length) return res.status(400).json({ ok: false, error: 'complete' });
      const r = await sendCampaignStep(order, step, siteUrl(req));
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      return res.json({ ok: true, ref: order.ref, campaign: r.campaign });
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
            panelUrl: `${siteUrl(req)}/app.html`,
          }));
        } catch (e) { console.error('assign email', e); }
      }
      return res.json({ ok: true, orders: await enrich(await adminListOrders()) });
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
            planName: b.plan ? (PLANS[b.plan]?.name || b.plan) : '', panelUrl: `${siteUrl(req)}/app.html`,
          }));
        } catch (e) { console.error('assign email', e); }
      }
      const orders = await enrich(await adminListOrders());
      return res.json({ ok: true, ref: r.ref, orders });
    }

    /* ----- order-scoped ----- */
    const order = await findOrderByRef(b.ref);
    if (action === 'get') {
      if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
      if (!owns(order)) return res.status(403).json({ ok: false, error: 'forbidden' });
      let decks = await decksForOrder(order.id);
      // Top up the board to the full offer (plan decks + upsells) as long as no work
      // has started - so old/partial orders show every element ready to fill, while
      // any order already in progress is left untouched.
      const started = decks.some(d => d.script || d.design_url || (Array.isArray(d.design_urls) && d.design_urls.length) || (d.status && d.status !== 'writing'));
      if (!started) {
        const r = await populateOrderElements(order.id, { plan: order.plan, addons: order.addons });
        if (r.created) decks = await decksForOrder(order.id);
      }
      return res.json({ ok: true, order: pub(order, isOwner), brief: order.answers || null, decks: decks.map(publicDeckLite), messages: await listMessages(order.id) });
    }

    if (action === 'messages') {
      if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
      if (!owns(order)) return res.status(403).json({ ok: false, error: 'forbidden' });
      return res.json({ ok: true, messages: await listMessages(order.id) });
    }

    // Owner/talent: a ready magic link to open this project's client view (for
    // testing / sharing) without waiting on the sign-in email.
    if (action === 'client_link') {
      if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
      if (!owns(order)) return res.status(403).json({ ok: false, error: 'forbidden' });
      if (!order.email) return res.status(400).json({ ok: false, error: 'no_email' });
      return res.json({ ok: true, url: clientMagicLink(siteUrl(req), order.email, order.ref || '') });
    }

    if (action === 'send_message') {
      if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
      if (!owns(order)) return res.status(403).json({ ok: false, error: 'forbidden' });
      const text = String(b.body || '').trim();
      const imgs = Array.isArray(b.images) ? b.images : [];
      if (!text && !imgs.length) return res.status(400).json({ ok: false, error: 'empty' });
      let dk = null;
      if (b.deckId) { const dd = await getDeck(b.deckId); if (dd && dd.order_id === order.id) dk = dd; }
      await addMessage(order.id, { deck_id: dk ? dk.id : null, sender: 'studio', sender_name: me.name || 'Brasero studio', body: text, images: imgs });
      const notifyBody = text || `📎 ${imgs.length} image${imgs.length > 1 ? 's' : ''} attached`;
      // Notify the client by email (they reply from their tracker).
      try {
        if (order.email) {
          const trackUrl = clientMagicLink(siteUrl(req), order.email, order.ref || '');
          await sendTo(order.email, `💬 A message about your Brasero order #${order.ref || ''}`, messageNotifyEmail({
            name: order.name, ref: order.ref, fromName: me.name || 'Brasero studio', body: notifyBody, about: dk ? dk.title : '',
            ctaUrl: trackUrl, ctaLabel: 'Open the conversation',
          }));
        }
      } catch (e) { console.error('msg notify client', e); }
      return res.json({ ok: true, messages: await listMessages(order.id) });
    }

    // Owner-only moderation: delete any message (client or studio) in a thread.
    if (action === 'delete_message') {
      if (!isOwner) return res.status(403).json({ ok: false, error: 'forbidden' });
      if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
      if (!b.messageId) return res.status(400).json({ ok: false, error: 'missing' });
      const removed = await deleteMessage(order.id, b.messageId);
      if (!removed) return res.status(404).json({ ok: false, error: 'message_not_found' });
      return res.json({ ok: true, messages: await listMessages(order.id) });
    }

    if (action === 'add_deck') {
      if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
      if (!owns(order)) return res.status(403).json({ ok: false, error: 'forbidden' });
      if (!isOwner) return res.status(403).json({ ok: false, error: 'owner_only' });
      const existing = await decksForOrder(order.id);
      const t = ['carousel', 'story', 'branding'].includes(b.type) ? b.type : 'carousel';
      await createDeck(order.id, { position: existing.length, title: b.title || `Deck ${existing.length + 1}`, type: t });
      return res.json({ ok: true, decks: (await decksForOrder(order.id)).map(publicDeckLite) });
    }

    if (action === 'add_upsell') {
      if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
      if (!owns(order)) return res.status(403).json({ ok: false, error: 'forbidden' });
      if (!isOwner) return res.status(403).json({ ok: false, error: 'owner_only' });
      const KEY = { story: 'story3', branding: 'brand_full' };
      const key = KEY[b.category];
      if (!key) return res.status(400).json({ ok: false, error: 'bad_category' });
      const r = await addItemsToOrder(order.ref || b.ref, key);
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      return res.json({ ok: true, decks: (await decksForOrder(order.id)).map(publicDeckLite) });
    }

    if (action === 'update_order') {
      if (!isOwner) return res.status(403).json({ ok: false, error: 'forbidden' });
      const target = await findOrderByRef(b.ref);
      if (!target) return res.status(404).json({ ok: false, error: 'not_found' });
      const plan = b.plan || target.plan;
      const addons = addonKeys(b.addons);
      const decks = (b.decks != null) ? Math.max(0, Math.min(50, Number(b.decks) || 0)) : undefined;
      const planAmt = b.billing === 'sub' ? amountFor(plan, 'sub') : (PLANS[plan] ? PLANS[plan].amount : 0);
      const amount = planAmt + addons.reduce((s, k) => s + (ADDONS[k] ? ADDONS[k].amount : 0), 0);
      const r = await updateOrder(b.ref, { ...b, addons, amount });
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      await syncOrderElements(target.id, { plan, addons, decks });   // add/remove assets to match the offer
      return res.json({ ok: true, orders: await enrich(await adminListOrders()) });
    }
    if (action === 'delete_order') {
      if (!isOwner) return res.status(403).json({ ok: false, error: 'forbidden' });
      const r = await deleteOrder(b.ref);
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      return res.json({ ok: true, orders: await enrich(await adminListOrders()) });
    }

    // Owner adds an arbitrary number of elements of a type (carousels / stories), no charge.
    if (action === 'add_elements') {
      if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
      if (!owns(order)) return res.status(403).json({ ok: false, error: 'forbidden' });
      if (!isOwner) return res.status(403).json({ ok: false, error: 'owner_only' });
      const type = ['carousel', 'story', 'branding'].includes(b.type) ? b.type : 'carousel';
      const n = Math.max(1, Math.min(50, Number(b.count) || 1));
      const existing = await decksForOrder(order.id);
      const label = type === 'story' ? 'Story' : type === 'branding' ? 'Branding' : 'Deck';
      let pos = existing.length, base = existing.filter(d => (d.type || 'carousel') === type).length;
      for (let i = 0; i < n; i++) await createDeck(order.id, { title: `${label} ${base + i + 1}`, position: pos++, type });
      return res.json({ ok: true, decks: (await decksForOrder(order.id)).map(publicDeckLite) });
    }

    // Owner adds a catalogue item (the same packs the client can buy) directly, no charge.
    if (action === 'add_item') {
      if (!order) return res.status(404).json({ ok: false, error: 'not_found' });
      if (!owns(order)) return res.status(403).json({ ok: false, error: 'forbidden' });
      if (!isOwner) return res.status(403).json({ ok: false, error: 'owner_only' });
      const r = await addItemsToOrder(order.ref || b.ref, b.key);
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      return res.json({ ok: true, decks: (await decksForOrder(order.id)).map(publicDeckLite) });
    }

    /* ----- deck-scoped (ownership checked via the deck's order) ----- */
    const deck = b.deckId ? await getDeck(b.deckId) : null;
    if (!deck) return res.status(404).json({ ok: false, error: 'deck_not_found' });
    const deckOrder = await getOrderById(deck.order_id);
    if (!deckOrder || !owns(deckOrder)) return res.status(403).json({ ok: false, error: 'forbidden' });

    // On-demand image bytes for a single deck (the board list ships only counts).
    if (action === 'deck_images') {
      return res.json({ ok: true, images: deckImages(deck) });
    }

    if (action === 'save_deck') {
      const patch = {};
      if (b.title != null) patch.title = b.title;
      if (b.script != null) patch.script = b.script;
      if (Array.isArray(b.images)) patch.design_urls = b.images.filter(Boolean).slice(0, 10);
      await patchDeck(deck.id, patch);
      return res.json({ ok: true, decks: (await decksForOrder(deck.order_id)).map(publicDeckLite) });
    }

    if (action === 'delete_deck') {
      if (!isOwner) return res.status(403).json({ ok: false, error: 'owner_only' });
      await deleteDeck(deck.id);
      return res.json({ ok: true, decks: (await decksForOrder(deck.order_id)).map(publicDeckLite) });
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
      if (b.title != null) patch.title = b.title;
      await patchDeck(deck.id, patch);

      const deckTitle = b.title != null ? b.title : deck.title;
      // Email the customer that they have something to validate.
      if (deckOrder.email) {
        const ref = deckOrder.ref || orderRef(deckOrder.stripe_session_id);
        const url = clientMagicLink(siteUrl(req), deckOrder.email, ref);
        try {
          await sendTo(deckOrder.email,
            isScript ? 'Your Brasero script is ready to review 👀' : 'Your Brasero design is ready to review 👀',
            reviewEmail({ name: deckOrder.name, kind: isScript ? 'script' : 'design', deckTitle, ref, url }));
        } catch (e) { console.error('review email', e); }
      }
      return res.json({ ok: true, decks: (await decksForOrder(deck.order_id)).map(publicDeckLite) });
    }

    return res.status(400).json({ ok: false, error: 'bad_action' });
  } catch (err) {
    console.error('admin', err);
    res.status(500).json({ ok: false });
  }
}
