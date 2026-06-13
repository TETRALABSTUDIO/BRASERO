import { send, saveOnboarding, verifyPaidSession, onboardingDone } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const { order: clientOrder = {}, answers = {}, sessionId = '' } = req.body || {};

    // SECURITY: only accept a brief tied to a genuinely paid Stripe session.
    const paid = await verifyPaidSession(sessionId);
    if (!paid) return res.status(402).json({ ok: false, error: 'payment_required' });

    // Anti-duplicate: a brief was already filed for this order - don't re-email/re-save.
    if (await onboardingDone(sessionId)) return res.json({ ok: true, already: true });

    // Trust the server-verified order for client/plan details; keep client answers.
    const order = { ...clientOrder, ...paid };
    try { await saveOnboarding({ sessionId, email: order.email, handle: order.handle, answers }); }
    catch (e) { console.error('saveOnboarding failed', e); }
    const escHtml = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = Object.entries(answers)
      .map(([k, v]) => `<tr><td style="padding:6px 12px;font-weight:700;vertical-align:top">${escHtml(k)}</td><td style="padding:6px 12px">${escHtml(v || '-')}</td></tr>`)
      .join('');
    await send(`📥 New onboarding - ${order.handle || order.email || 'client'}`,
      `<h2>New onboarding submitted</h2>
       <p><b>Client:</b> ${order.name || '-'} · ${order.email || '-'}</p>
       <p><b>Plan:</b> ${order.planName || order.plan || '-'} (${order.billing === 'sub' ? 'subscription' : 'one-time'})</p>
       <p><b>Instagram:</b> ${order.handle || ''} ${order.instagram ? `(${order.instagram})` : ''}</p>
       <table style="border-collapse:collapse;margin-top:12px">${rows}</table>`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
}
