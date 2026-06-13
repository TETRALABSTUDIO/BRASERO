import { verifyTalentPassword, talentSession, loginCode, loginCodeEmail,
  hashPassword, verifyPassword, getTalentByEmail, createTalent, updateTalent, verifyToken, signToken,
  getClientByEmail, emailHasOrders, upsertClient, touchClient, signClientSession,
  magicLinkEmail, sendTo, siteUrl } from './_lib.js';

// Authentication for all roles.
//   Talent/owner (password + email 2FA):
//   login         { email, password }              → { twofa, email, pending }
//                 (emails a 6-digit code; no session yet)
//   verify_2fa    { pending, code }                → { token, talent }
//   me            (Authorization: Bearer <token>)  → { talent }
//   bootstrap     { email, password, name }        → create the first OWNER
//                 (requires header x-admin-token === ADMIN_TOKEN; DB mode only)
//   Client (passwordless, magic link):
//   request_magic { email }                        → { ok } (always; emails a link
//                 only if the address has an account or a past order)
//   verify_magic  { token }                        → { token, client }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const b = req.body || {};

    // Team password login, step 1: verify the password, then email a one-time
    // code. We return a signed, short-lived "pending" challenge (carrying a
    // scrypt hash of the code, never the code itself) instead of a session.
    if (b.action === 'login') {
      const t = await verifyTalentPassword(b.email, b.password);
      if (!t) return res.status(401).json({ ok: false, error: 'invalid' });
      const code = loginCode();
      const pending = signToken({ twofa: true, email: t.email, ch: hashPassword(code) }, 10 / 1440); // 10 min
      await sendTo(t.email, 'Your Brasero verification code 🔒', loginCodeEmail({ name: t.name, code }));
      return res.json({ ok: true, twofa: true, email: t.email, pending });
    }

    // Team password login, step 2: exchange the pending challenge + the emailed
    // code for a real session.
    if (b.action === 'verify_2fa') {
      const s = verifyToken(b.pending);
      if (!s || !s.twofa || !s.email || !s.ch) return res.status(401).json({ ok: false, error: 'expired' });
      if (!verifyPassword(String(b.code || '').trim(), s.ch)) return res.status(401).json({ ok: false, error: 'bad_code' });
      const t = await getTalentByEmail(s.email);
      if (!t) return res.status(404).json({ ok: false, error: 'not_found' });
      return res.json({ ok: true, token: talentSession(t),
        talent: { email: t.email, name: t.name || '', is_owner: !!t.is_owner, must_reset: !!t.must_reset } });
    }

    if (b.action === 'setup') {
      // First login from an invite link: set password + name + photo, then sign in.
      const s = verifyToken(b.token);
      if (!s || !s.setup || !s.email) return res.status(401).json({ ok: false, error: 'invalid' });
      if (!b.password || String(b.password).length < 6) return res.status(400).json({ ok: false, error: 'weak' });
      const t = await getTalentByEmail(s.email);
      if (!t) return res.status(404).json({ ok: false, error: 'not_found' });
      const r = await updateTalent({ email: s.email, name: b.name, password: b.password, photo: b.photo });
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      return res.json({ ok: true, token: signToken({ email: t.email, owner: !!t.is_owner, role: t.is_owner ? 'owner' : 'talent' }),
        talent: { email: t.email, name: b.name || t.name || '', is_owner: !!t.is_owner } });
    }

    // Client: request a passwordless sign-in link. Always returns ok so the
    // endpoint never reveals which emails have an account/order.
    if (b.action === 'request_magic') {
      const EM = String(b.email || '').trim().toLowerCase();
      if (EM && (await getClientByEmail(EM) || await emailHasOrders(EM))) {
        const c = await upsertClient({ email: EM });
        if (c) {
          const token = signToken({ email: c.email, cid: c.id, magic: true }, 30 / 1440); // 30 min
          const url = `${siteUrl(req)}/app.html?magic=${encodeURIComponent(token)}`;
          await sendTo(c.email, 'Your Brasero sign-in link 🔥', magicLinkEmail({ name: c.name, url }));
        }
      }
      return res.json({ ok: true });
    }

    // Client: exchange a magic-link token for a long-lived session.
    if (b.action === 'verify_magic') {
      const s = verifyToken(b.token);
      if (!s || !s.magic || !s.email) return res.status(401).json({ ok: false, error: 'invalid' });
      const c = await upsertClient({ email: s.email });
      if (!c) return res.status(404).json({ ok: false, error: 'not_found' });
      await touchClient(c);
      return res.json({ ok: true, token: signClientSession(c), client: { email: c.email, name: c.name || '' } });
    }

    if (b.action === 'me') {
      const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.headers['x-talent-token'];
      const s = verifyToken(tok);
      if (!s) return res.status(401).json({ ok: false, error: 'invalid' });
      const t = await getTalentByEmail(s.email);
      if (!t) return res.status(401).json({ ok: false, error: 'invalid' });
      return res.json({ ok: true, talent: { email: t.email, name: t.name || '', is_owner: !!t.is_owner } });
    }

    if (b.action === 'bootstrap') {
      if (!process.env.ADMIN_TOKEN || req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ ok: false, error: 'unauthorized' });
      }
      const r = await createTalent({ email: b.email, password: b.password, name: b.name, is_owner: true });
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      return res.json({ ok: true, talent: r.talent });
    }

    return res.status(400).json({ ok: false, error: 'bad_action' });
  } catch (err) {
    console.error('auth', err);
    res.status(500).json({ ok: false });
  }
}
