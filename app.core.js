/* ============================================================================
   app.core.js - shared core for the unified role-based app (Phase 2)
   Imported once by every role bundle (client / owner / talent). Holds the
   primitives that were duplicated across panel.html + track.html: API base,
   signed-token decode, authenticated fetch, HTML escaping, initials, avatar
   markup, and the shared lightbox. Role bundles import what they need.
   ========================================================================== */

export const API =
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:4242' : '';

/* ---- session token (localStorage 'brasero_session' for all roles) ---- */
export const SESSION_KEY = 'brasero_session';
export const getToken = () => localStorage.getItem(SESSION_KEY) || '';
export const setToken = (t) => localStorage.setItem(SESSION_KEY, t);
export const clearToken = () => localStorage.removeItem(SESSION_KEY);

/* Decode the payload of a signToken() value (`b64url(json).hmac`).
   Client-side we cannot verify the HMAC, only read the claims for routing.
   The server re-verifies on every request, so this is display/routing only. */
export function decodeToken(token) {
  try {
    const body = (token || '').split('.')[0];
    if (!body) return null;
    const json = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
    const p = JSON.parse(json);
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch { return null; }
}

/* Role of the current session: 'owner' | 'talent' | 'client' | null.
   Owner tokens carry role:'owner' (older tokens may only set owner:true). */
export function sessionRole(token = getToken()) {
  const p = decodeToken(token);
  if (!p) return null;
  if (p.role) return p.role;
  if (p.owner) return 'owner';
  if (p.cid) return 'client';
  return 'talent';
}

/* ---- authenticated fetch ---- */
export async function api(path, body) {
  const token = getToken();
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body || {}),
  });
  if (r.status === 401) { clearToken(); location.href = 'app.html'; throw new Error('unauthorized'); }
  return r.json();
}

/* Unauthenticated POST (login / magic-link request before a session exists). */
export async function post(path, body) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return r.json();
}

/* ---- text helpers ---- */
export function esc(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}
export function igUser(s) {
  s = (s || '').toString().trim();
  if (!s) return '';
  const m = s.replace(/\/+$/, '').match(/instagram\.com\/([^/?#]+)/i);
  return (m ? m[1] : s).replace(/^@/, '').trim();
}

/* Avatar markup: an img when src given, else an initials gradient disc. */
export function avatar(name, src, cls = '') {
  if (src) return `<img class="avatar ${cls}" src="${esc(src)}" alt="">`;
  return `<div class="avatar ${cls}">${esc(initials(name))}</div>`;
}

/* ---- shared lightbox (chat + gallery image zoom) ---- */
let _lb;
export function lightbox(src) {
  if (!_lb) {
    _lb = document.createElement('div');
    _lb.className = 'lb';
    _lb.innerHTML = '<img alt="">';
    _lb.addEventListener('click', () => _lb.classList.remove('open'));
    document.body.appendChild(_lb);
  }
  _lb.querySelector('img').src = src;
  _lb.classList.add('open');
}

/* ---- chat / media helpers (shared by the client + team boards) ---- */

/* "Jun 3 · 14:20" timestamp for a chat message. */
export function fmtMsgTime(iso) { try { const d = new Date(iso); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }

/* Downscale + JPEG-compress an image File to a data URL (chat attachments). */
export function compress(file, max = 1280, qual = 0.72) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > max || h > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); res(c.toDataURL('image/jpeg', qual));
    };
    img.onerror = () => res('');
    const fr = new FileReader(); fr.onload = () => (img.src = fr.result); fr.readAsDataURL(file);
  });
}

/* ---- deck slide script (shared read rendering) ----
   A deck `script` is either a JSON array of slide HTML strings or plain text.
   parseSlides normalizes to an array; sanitizeSlide strips unsafe markup;
   slidesViewHTML renders the read-only slide stack. (The per-role editors
   live in their own bundles.) */
export function parseSlides(s) {
  if (s) {
    try { const a = JSON.parse(s); if (Array.isArray(a) && a.length && a.every((x) => typeof x === 'string')) return a; } catch (e) {}
    if (s.trim()) return [esc(s).replace(/\n/g, '<br>')];
  }
  return [''];
}
export function sanitizeSlide(html) {
  const t = document.createElement('div'); t.innerHTML = html || '';
  t.querySelectorAll('script,style,iframe,object,embed,link,meta,img').forEach((n) => n.remove());
  t.querySelectorAll('*').forEach((n) => { [...n.attributes].forEach((a) => { const nm = a.name.toLowerCase(); if (nm.startsWith('on') || ['href', 'src', 'srcset', 'class', 'id'].includes(nm)) n.removeAttribute(a.name); }); });
  return t.innerHTML.trim();
}
/* The first slide of a deck/story is always the Hook, the last the Call to
   action; both get a faint orange tint. Middle slides are just numbered. */
export function slideMeta(i, total) {
  if (i === 0) return { label: 'Hook', cls: 'slide--hook' };
  if (i === total - 1) return { label: 'Call to action', cls: 'slide--cta' };
  return { label: 'Slide ' + (i + 1), cls: '' };
}
export function slidesViewHTML(script) {
  const slides = parseSlides(script);
  return `<div class="slides">${slides.map((h, i) => { const c = sanitizeSlide(h), m = slideMeta(i, slides.length);
    return `<div class="slide ${m.cls}"><div class="slide__bar"><span class="slide__n">${m.label}</span></div><div class="slide__view">${c || '<span class="slide__empty">Empty</span>'}</div></div>`; }).join('')}</div>`;
}

/* ---- branding elements ----
   Unlike decks/stories (the studio writes a script), branding elements collect
   their step-1 info FROM the client. The fields depend on the element kind,
   inferred from its title:
     - profile : upload a photo to enhance, or describe an avatar
     - cta     : just the (up to 3) CTA button labels
     - banner  : headline + links + metrics  (X / LinkedIn / Facebook banners) */
export function brandKind(title) {
  const t = String(title || '').toLowerCase();
  if (/profile|photo|pfp|avatar/.test(t)) return 'profile';
  if (/cta|button/.test(t)) return 'cta';
  return 'banner';
}
export function normBrand(d) {
  const k = brandKind(d && d.title), b = (d && d.brand && typeof d.brand === 'object') ? d.brand : {};
  if (k === 'profile') return { kind: k, mode: b.mode === 'avatar' ? 'avatar' : 'upload', photo: b.photo || '', desc: b.desc || '' };
  if (k === 'cta') return { kind: k, ctas: (Array.isArray(b.ctas) ? b.ctas : []).slice(0, 3).map(s => String(s || '')) };
  return { kind: k, headline: b.headline || '',
    links: (Array.isArray(b.links) ? b.links : []).map(s => String(s || '')).filter(Boolean).slice(0, 6),
    metrics: (Array.isArray(b.metrics) ? b.metrics : []).filter(m => m && (m.name || m.value)).map(m => ({ name: String(m.name || ''), value: String(m.value || '') })).slice(0, 6) };
}
export function brandFilled(d) {
  const b = normBrand(d);
  if (b.kind === 'profile') return b.mode === 'upload' ? !!b.photo : !!b.desc.trim();
  if (b.kind === 'cta') return b.ctas.some(s => s.trim());
  return !!(b.headline.trim() || b.links.length || b.metrics.length);
}
/* Read-only render of the client-submitted branding brief (studio + client recap). */
export function brandBriefView(d) {
  const b = normBrand(d);
  if (!brandFilled(d)) return `<div class="bb bb--empty">No branding details yet.</div>`;
  const row = (k, v) => `<div class="bb__row"><span class="bb__k">${k}</span><span class="bb__v">${v}</span></div>`;
  if (b.kind === 'profile') {
    return `<div class="bb">${b.mode === 'upload'
      ? row('Photo to enhance', b.photo ? `<img class="bb__photo" src="${esc(b.photo)}" alt="">` : '<i>none</i>')
      : row('Avatar brief', esc(b.desc) || '<i>none</i>')}</div>`;
  }
  if (b.kind === 'cta') {
    return `<div class="bb">${b.ctas.filter(s => s.trim()).map((s, i) => row('CTA ' + (i + 1), esc(s))).join('') || '<div class="bb bb--empty">No CTAs.</div>'}</div>`;
  }
  const links = b.links.length ? `<span class="bb__chips">${b.links.map(l => `<a class="bb__chip" href="${esc(l)}" target="_blank" rel="noopener">${esc(l.replace(/^https?:\/\//, ''))}</a>`).join('')}</span>` : '<i>none</i>';
  const metrics = b.metrics.length ? `<span class="bb__metrics">${b.metrics.map(m => `<span class="bb__metric"><b>${esc(m.value)}</b>${esc(m.name)}</span>`).join('')}</span>` : '<i>none</i>';
  return `<div class="bb">${row('Headline', esc(b.headline) || '<i>none</i>')}${row('Links', links)}${row('Metrics', metrics)}</div>`;
}

/* Tiny query helpers. */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
