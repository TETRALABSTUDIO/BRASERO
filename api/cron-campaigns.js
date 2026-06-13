import { runDueCampaigns, siteUrl } from './_lib.js';

// Daily cron (see vercel.json): sends the next due step of every lead-recovery
// campaign that has `auto` on. Secured by CRON_SECRET when set — Vercel includes
// `Authorization: Bearer <CRON_SECRET>` on cron invocations.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  try {
    const r = await runDueCampaigns(siteUrl(req));
    return res.json(r);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
}
