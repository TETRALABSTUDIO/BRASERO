/* ============================================================================
   app.core.js — shared core for the unified role-based app (Phase 2)
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

/* Tiny query helpers. */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
