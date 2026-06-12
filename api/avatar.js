// Self-hosted Instagram avatar proxy — replicates the strategy of the open-source
// unavatar (github.com/indieweb/unavatar) for the Instagram provider, so we don't
// depend on the now-paywalled unavatar.io. Fetches the public profile JSON, then
// streams the profile picture back (avoids CORS / hotlink issues). 404 → the
// frontend falls back to an initials avatar.
//   GET /api/avatar?u=<instagram_username>
export default async function handler(req, res) {
  const raw = (req.query && req.query.u) || '';
  const u = String(raw).replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 60);
  if (!u) return res.status(400).end();
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  const headers = {
    'x-ig-app-id': '936619743392459', 'user-agent': UA, accept: '*/*',
    'accept-language': 'en-US,en;q=0.9', 'x-requested-with': 'XMLHttpRequest', 'x-ig-www-claim': '0',
    referer: 'https://www.instagram.com/', 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty',
  };
  try {
    const r = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(u)}`, { headers });
    if (!r.ok) return res.status(404).end();
    const j = await r.json();
    const pic = j && j.data && j.data.user && (j.data.user.profile_pic_url_hd || j.data.user.profile_pic_url);
    if (!pic) return res.status(404).end();
    const img = await fetch(pic, { headers: { 'user-agent': UA } });
    if (!img.ok) return res.status(404).end();
    const buf = Buffer.from(await img.arrayBuffer());
    res.setHeader('Content-Type', img.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');   // cache a day in browsers, a week at the edge
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(404).end();
  }
}
