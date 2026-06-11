import { loginTalent, getTalentByEmail, createTalent, verifyToken } from './_lib.js';

// Talent authentication.
//   login     { email, password }                 → { token, talent }
//   me        (Authorization: Bearer <token>)     → { talent }
//   bootstrap { email, password, name }           → create the first OWNER
//             (requires header x-admin-token === ADMIN_TOKEN; DB mode only)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const b = req.body || {};

    if (b.action === 'login') {
      const r = await loginTalent(b.email, b.password);
      if (!r) return res.status(401).json({ ok: false, error: 'invalid' });
      return res.json({ ok: true, ...r });
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
