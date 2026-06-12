import { findOrderByRefEmail, findOrderByRef, decksForOrder, getDeck, patchDeck, publicOrder, send,
  sendTo, getTalentByEmail, talentClientActionEmail, talentProjectDoneEmail, siteUrl,
  clientFromAuth, ownsOrder } from './_lib.js';

// Customer-driven deck actions, authenticated EITHER by a client session (Bearer
// token) or legacy ref + email each call.
//   action = validate_script | validate_design | request_revision
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const { ref = '', email = '', deckId = '', action = '', script = '', note = '' } = req.body || {};
    if (!ref || !deckId || !action) return res.status(400).json({ ok: false, error: 'missing' });

    const client = clientFromAuth(req);
    let order = null;
    if (client) {
      const o = await findOrderByRef(ref);
      if (ownsOrder(o, client)) order = o;
    } else if (email) {
      order = await findOrderByRefEmail(ref, email);
    }
    if (!order) return res.status(client ? 403 : 404).json({ ok: false, error: 'not_found' });

    const deck = await getDeck(deckId);
    if (!deck || deck.order_id !== order.id) return res.status(403).json({ ok: false, error: 'forbidden' });

    const now = new Date().toISOString();
    let patch = null, notify = '';

    if (action === 'validate_script') {
      if (deck.status !== 'script_review') return res.status(409).json({ ok: false, error: 'wrong_state' });
      patch = { script: String(script || deck.script || ''), status: 'designing', script_validated_at: now };
      notify = `✅ Script approved - "${deck.title || 'deck'}" (#${order.ref || ''})`;
    } else if (action === 'validate_design') {
      if (deck.status !== 'design_review') return res.status(409).json({ ok: false, error: 'wrong_state' });
      patch = { status: 'done', design_validated_at: now };
      notify = `🎉 Design approved - "${deck.title || 'deck'}" (#${order.ref || ''})`;
    } else if (action === 'request_revision') {
      if (deck.status !== 'design_review') return res.status(409).json({ ok: false, error: 'wrong_state' });
      patch = { status: 'revision', revision_note: String(note || '').slice(0, 2000) };
      notify = `✏️ Retouch requested - "${deck.title || 'deck'}" (#${order.ref || ''})`;
    } else {
      return res.status(400).json({ ok: false, error: 'bad_action' });
    }

    await patchDeck(deckId, patch);

    // Notify the studio inbox (no-ops if MAIL_TO unset).
    try {
      await send(notify, `<h2>${notify}</h2>
        <p><b>Client:</b> ${order.name || '-'} · ${order.email}</p>
        <p><b>Order:</b> #${order.ref || ''} · ${order.plan || ''}</p>
        ${note ? `<p><b>Retouch note:</b><br>${String(note).replace(/</g, '&lt;')}</p>` : ''}`);
    } catch (e) { console.error('notify', e); }

    const decks = await decksForOrder(order.id);

    // Notify the assigned talent (client approved / requested a change), and on full completion.
    try {
      if (order.talent_email) {
        const talent = await getTalentByEmail(order.talent_email);
        const panelUrl = `${siteUrl(req)}/panel.html`;
        const kind = action === 'validate_script' ? 'approved_script' : action === 'validate_design' ? 'approved_design' : 'revision';
        const subj = kind === 'approved_script' ? '✅ Your client approved a script'
          : kind === 'approved_design' ? '🎉 Your client approved a design'
          : '✏️ Your client requested a retouch';
        await sendTo(order.talent_email, subj, talentClientActionEmail({ name: talent?.name, ref, deckTitle: deck.title, kind, note, panelUrl }));
        if (action === 'validate_design' && decks.length && decks.every(d => d.status === 'done')) {
          await sendTo(order.talent_email, '🎉 Project completed', talentProjectDoneEmail({ name: talent?.name, ref, clientName: order.name, panelUrl }));
        }
      }
    } catch (e) { console.error('talent notify', e); }

    res.json({ ok: true, order: publicOrder(order, decks) });
  } catch (err) {
    console.error('deck', err);
    res.status(500).json({ ok: false });
  }
}
